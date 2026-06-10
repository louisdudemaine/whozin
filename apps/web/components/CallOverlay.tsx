"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/locale";
import { useCall } from "@/lib/calls";
import { Avatar } from "./Avatar";

function fmt(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** Surcouche d'appel plein écran — sonnerie, connexion, appel actif. */
export function CallOverlay() {
  const { locale } = useT();
  const fr = locale === "fr";
  const {
    state,
    info,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    duration,
    error,
    accept,
    decline,
    hangup,
    toggleMute,
    toggleCamera,
  } = useCall();

  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localRef.current && localStream) localRef.current.srcObject = localStream;
  }, [localStream, state]);
  useEffect(() => {
    if (remoteRef.current && remoteStream) remoteRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, state]);

  if (state === "idle") {
    return error ? (
      <div className="glass fixed left-1/2 top-6 z-[90] -translate-x-1/2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-2">
        {error}
      </div>
    ) : null;
  }
  if (!info) return null;

  const isVideo = info.kind === "video";
  const name = info.other.display_name || info.other.username;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-between overflow-hidden bg-background">
      <div className="neon-rain neon-rain--intense absolute inset-0" aria-hidden />

      {/* vidéo distante plein écran quand active */}
      {isVideo && remoteStream && (
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* audio distant (appel vocal) */}
      {!isVideo && <audio ref={remoteAudioRef} autoPlay />}

      {/* ma caméra en PiP */}
      {isVideo && localStream && (
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="glass absolute right-4 top-[max(16px,env(safe-area-inset-top))] z-10 w-28 rounded-2xl object-cover"
          style={{ aspectRatio: "3/4", transform: "scaleX(-1)" }}
        />
      )}

      {/* état + identité */}
      <div className="relative z-10 mt-[max(56px,12vh)] flex flex-col items-center gap-4 px-6 text-center">
        {(!isVideo || !remoteStream) && (
          <span
            className="ring"
            style={{
              animationDuration: state === "active" ? "6s" : "2.5s",
              filter: "drop-shadow(0 0 24px var(--glow-rose))",
            }}
          >
            <Avatar profile={info.other} size={104} />
          </span>
        )}
        {(!isVideo || !remoteStream) && (
          <div>
            <p className="font-display text-2xl font-extrabold">{name}</p>
            <p className="mt-1.5 flex items-center justify-center gap-2 text-sm text-text-dim">
              {state === "active" ? (
                <span className="font-display text-base text-accent">{fmt(duration)}</span>
              ) : (
                <>
                  <span className="live-dot" style={{ width: 6, height: 6 }} />
                  {state === "incoming"
                    ? fr
                      ? `t'appelle en ${isVideo ? "vidéo" : "audio"}…`
                      : `is calling you (${isVideo ? "video" : "audio"})…`
                    : state === "outgoing"
                      ? fr
                        ? "Sonnerie…"
                        : "Ringing…"
                      : fr
                        ? "Connexion…"
                        : "Connecting…"}
                </>
              )}
            </p>
          </div>
        )}
        {isVideo && remoteStream && state === "active" && (
          <span className="glass rounded-full px-3 py-1 text-xs font-bold">
            {name} · <span className="text-accent">{fmt(duration)}</span>
          </span>
        )}
      </div>

      {/* contrôles */}
      <div className="relative z-10 mb-[max(28px,env(safe-area-inset-bottom)+16px)] flex items-center gap-4">
        {state === "incoming" ? (
          <>
            <CtrlBtn onClick={decline} label={fr ? "Refuser" : "Decline"} danger>
              <HangIcon />
            </CtrlBtn>
            <button
              onClick={accept}
              aria-label={fr ? "Accepter" : "Accept"}
              className="glow-cta pressable flex h-[72px] w-[72px] items-center justify-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg,#16d9c5,#3ddc84)" }}
            >
              {isVideo ? <CamIcon on /> : <PhoneIcon />}
            </button>
          </>
        ) : (
          <>
            <CtrlBtn onClick={toggleMute} label="Micro" active={!muted}>
              <MicIcon on={!muted} />
            </CtrlBtn>
            {isVideo && (
              <CtrlBtn onClick={toggleCamera} label="Caméra" active={!cameraOff}>
                <CamIcon on={!cameraOff} />
              </CtrlBtn>
            )}
            <CtrlBtn onClick={hangup} label={fr ? "Raccrocher" : "Hang up"} danger big>
              <HangIcon />
            </CtrlBtn>
          </>
        )}
      </div>
    </div>
  );
}

function CtrlBtn({
  children,
  onClick,
  label,
  danger,
  active = true,
  big,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
  active?: boolean;
  big?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`pressable flex items-center justify-center rounded-full ${big ? "h-[72px] w-[72px]" : "h-14 w-14"} ${danger ? "" : "glass"}`}
      style={
        danger
          ? {
              background: "linear-gradient(135deg,#ff2e63,#ff7849)",
              boxShadow: "0 0 28px -6px var(--glow-rose)",
              color: "#fff",
            }
          : { opacity: active ? 1 : 0.5 }
      }
    >
      {children}
    </button>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2Z" />
    </svg>
  );
}
function HangIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(135deg)" }}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2Z" />
    </svg>
  );
}
function MicIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
      {!on && <path d="M3 3l18 18" stroke="var(--brand)" />}
    </svg>
  );
}
function CamIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 10.5 21 7v10l-6-3.5" />
      <rect x="2" y="6" width="13" height="12" rx="2" />
      {!on && <path d="M3 3l18 18" stroke="var(--brand)" />}
    </svg>
  );
}
