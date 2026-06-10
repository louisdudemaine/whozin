"use client";

/**
 * Appels vocaux/vidéo 1-1 — WebRTC pair-à-pair,
 * signalisation par Supabase Realtime (broadcast). Aucun vendeur externe.
 *
 * Canaux :
 *  - `ring:{userId}`  : sonnerie personnelle (chaque user y est abonné en permanence)
 *  - `call:{callId}`  : échange SDP/ICE + fin d'appel entre les 2 pairs
 *
 * NB prod : STUN public Google. Pour les NAT stricts (~10 %), ajouter un TURN
 * (ex. coturn / Cloudflare Calls) dans ICE_SERVERS.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Profile } from "@whosin/shared";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth";
import { sendMessage } from "./data";
import { pushNotify } from "./push";

export type CallKind = "audio" | "video";
export type CallState = "idle" | "incoming" | "outgoing" | "connecting" | "active";

export interface CallInfo {
  callId: string;
  kind: CallKind;
  other: Profile;
  conversationId: string | null;
  /** true si c'est moi qui appelle */
  initiator: boolean;
}

interface CallCtx {
  state: CallState;
  info: CallInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  duration: number;
  error: string | null;
  startCall: (other: Profile, kind: CallKind, conversationId?: string | null) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

const RING_TIMEOUT_MS = 30_000;

const Ctx = createContext<CallCtx | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [state, setState] = useState<CallState>("idle");
  const [info, setInfo] = useState<CallInfo | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callChanRef = useRef<RealtimeChannel | null>(null);
  const ringChanRef = useRef<RealtimeChannel | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<CallState>("idle");
  const infoRef = useRef<CallInfo | null>(null);
  stateRef.current = state;
  infoRef.current = info;

  const cleanup = useCallback(() => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
    if (durTimer.current) clearInterval(durTimer.current);
    ringTimer.current = null;
    durTimer.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (callChanRef.current) {
      getSupabase().removeChannel(callChanRef.current);
      callChanRef.current = null;
    }
    pendingIce.current = [];
    setLocalStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setDuration(0);
    setState("idle");
    setInfo(null);
  }, []);

  /** Journal d'appel dans la conversation (côté appelant seulement). */
  const logCall = useCallback(
    (i: CallInfo, secs: number) => {
      if (!profile || !i.initiator || !i.conversationId) return;
      const label = i.kind === "video" ? "Appel vidéo" : "Appel audio";
      const body =
        secs > 0
          ? `📞 ${label} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
          : `📞 ${label} manqué`;
      sendMessage(i.conversationId, profile.id, body).catch(() => {});
    },
    [profile]
  );

  const endCall = useCallback(
    (notifyPeer: boolean) => {
      const i = infoRef.current;
      const secs = durTimer.current ? duration : 0;
      if (notifyPeer && callChanRef.current) {
        callChanRef.current.send({ type: "broadcast", event: "end", payload: {} }).catch(() => {});
      }
      if (i) logCall(i, stateRef.current === "active" ? secs : 0);
      cleanup();
    },
    [cleanup, duration, logCall]
  );

  /** Crée la RTCPeerConnection branchée sur le canal d'appel. */
  const createPeer = useCallback((stream: MediaStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0] ?? new MediaStream([e.track]));
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && callChanRef.current) {
        callChanRef.current
          .send({ type: "broadcast", event: "ice", payload: e.candidate.toJSON() })
          .catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setState("active");
        if (!durTimer.current) {
          durTimer.current = setInterval(() => setDuration((d) => d + 1), 1000);
        }
      }
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        if (stateRef.current === "active") endCall(false);
      }
    };
    return pc;
  }, [endCall]);

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingIce.current) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* ignore */
      }
    }
    pendingIce.current = [];
  }, []);

  /** Abonne le canal d'appel (SDP/ICE/fin). */
  const joinCallChannel = useCallback(
    (callId: string, asInitiator: boolean) => {
      const supabase = getSupabase();
      const chan = supabase.channel(`call:${callId}`);
      chan
        .on("broadcast", { event: "ready" }, async () => {
          // le destinataire est prêt -> l'appelant crée l'offre
          if (!asInitiator || !pcRef.current) return;
          setState("connecting");
          const offer = await pcRef.current.createOffer();
          await pcRef.current.setLocalDescription(offer);
          chan.send({ type: "broadcast", event: "sdp", payload: { kind: "offer", sdp: offer } });
        })
        .on("broadcast", { event: "sdp" }, async ({ payload }) => {
          const pc = pcRef.current;
          if (!pc) return;
          if (payload.kind === "offer" && !asInitiator) {
            await pc.setRemoteDescription(payload.sdp);
            await flushIce();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            chan.send({ type: "broadcast", event: "sdp", payload: { kind: "answer", sdp: answer } });
          } else if (payload.kind === "answer" && asInitiator) {
            await pc.setRemoteDescription(payload.sdp);
            await flushIce();
          }
        })
        .on("broadcast", { event: "ice" }, async ({ payload }) => {
          const pc = pcRef.current;
          if (pc?.remoteDescription) {
            try {
              await pc.addIceCandidate(payload);
            } catch {
              /* ignore */
            }
          } else {
            pendingIce.current.push(payload);
          }
        })
        .on("broadcast", { event: "end" }, () => {
          const i = infoRef.current;
          if (i && stateRef.current !== "active") logCall(i, 0);
          else if (i) logCall(i, duration);
          cleanup();
        })
        .subscribe();
      callChanRef.current = chan;
      return chan;
    },
    [cleanup, duration, flushIce, logCall]
  );

  const getMedia = useCallback(async (kind: CallKind): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === "video" ? { facingMode: "user" } : false,
      });
      setLocalStream(stream);
      return stream;
    } catch {
      setError("Micro/caméra inaccessible. Vérifie les permissions.");
      setTimeout(() => setError(null), 4000);
      return null;
    }
  }, []);

  /** APPELER quelqu'un. */
  const startCall = useCallback(
    async (other: Profile, kind: CallKind, conversationId: string | null = null) => {
      if (!profile || stateRef.current !== "idle") return;
      const stream = await getMedia(kind);
      if (!stream) return;

      const callId = crypto.randomUUID();
      const i: CallInfo = { callId, kind, other, conversationId, initiator: true };
      setInfo(i);
      setState("outgoing");
      createPeer(stream);
      joinCallChannel(callId, true);

      // fait sonner chez l'autre
      const supabase = getSupabase();
      const ring = supabase.channel(`ring:${other.id}`);
      ring.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          ring.send({
            type: "broadcast",
            event: "ring",
            payload: {
              callId,
              kind,
              conversationId,
              from: {
                id: profile.id,
                username: profile.username,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
              },
            },
          });
          // canal jetable : on le ferme après l'envoi
          setTimeout(() => supabase.removeChannel(ring), 1500);
        }
      });

      // notif push (sonne même si l'app est fermée -> ouvre la conversation)
      pushNotify(
        other.id,
        {
          title: profile.display_name || profile.username,
          body: kind === "video" ? "📹 Appel vidéo entrant…" : "📞 Appel entrant…",
          url: conversationId ? `/messages/${conversationId}` : "/messages",
          tag: `call-${callId}`,
        },
        conversationId
      );

      // pas de réponse en 30 s -> raccroche (appel manqué)
      ringTimer.current = setTimeout(() => {
        if (stateRef.current === "outgoing") endCall(true);
      }, RING_TIMEOUT_MS);
    },
    [createPeer, endCall, getMedia, joinCallChannel, profile]
  );

  /** ACCEPTER l'appel entrant. */
  const accept = useCallback(async () => {
    const i = infoRef.current;
    if (!i || stateRef.current !== "incoming") return;
    const stream = await getMedia(i.kind);
    if (!stream) {
      cleanup();
      return;
    }
    setState("connecting");
    createPeer(stream);
    const chan = joinCallChannel(i.callId, false);
    // préviens l'appelant qu'on est prêt à recevoir l'offre
    const iv = setInterval(() => {
      if (chan.state === "joined") {
        chan.send({ type: "broadcast", event: "ready", payload: {} });
        clearInterval(iv);
      }
    }, 150);
    setTimeout(() => clearInterval(iv), 5000);
  }, [cleanup, createPeer, getMedia, joinCallChannel]);

  const decline = useCallback(() => {
    const i = infoRef.current;
    if (!i) return;
    // informe l'appelant via le canal d'appel
    const supabase = getSupabase();
    const chan = supabase.channel(`call:${i.callId}`);
    chan.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        chan.send({ type: "broadcast", event: "end", payload: { reason: "declined" } });
        setTimeout(() => supabase.removeChannel(chan), 1000);
      }
    });
    cleanup();
  }, [cleanup]);

  const hangup = useCallback(() => endCall(true), [endCall]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      localStream?.getAudioTracks().forEach((t) => (t.enabled = m));
      return !m;
    });
  }, [localStream]);

  const toggleCamera = useCallback(() => {
    setCameraOff((c) => {
      localStream?.getVideoTracks().forEach((t) => (t.enabled = c));
      return !c;
    });
  }, [localStream]);

  // ── sonnerie personnelle : toujours à l'écoute quand connecté ──
  useEffect(() => {
    if (!profile) return;
    const supabase = getSupabase();
    const ring = supabase.channel(`ring:${profile.id}`);
    ring
      .on("broadcast", { event: "ring" }, ({ payload }) => {
        if (stateRef.current !== "idle") return; // déjà en appel -> ignore
        setInfo({
          callId: payload.callId,
          kind: payload.kind,
          other: payload.from as Profile,
          conversationId: payload.conversationId ?? null,
          initiator: false,
        });
        setState("incoming");
        // l'appelant a un timeout de 30 s ; on s'aligne
        ringTimer.current = setTimeout(() => {
          if (stateRef.current === "incoming") cleanup();
        }, RING_TIMEOUT_MS);
      })
      .subscribe();
    ringChanRef.current = ring;
    return () => {
      supabase.removeChannel(ring);
      ringChanRef.current = null;
    };
  }, [profile, cleanup]);

  return (
    <Ctx.Provider
      value={{
        state,
        info,
        localStream,
        remoteStream,
        muted,
        cameraOff,
        duration,
        error,
        startCall,
        accept,
        decline,
        hangup,
        toggleMute,
        toggleCamera,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCall(): CallCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
