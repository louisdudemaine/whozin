"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EphemeralMode, Message, Profile } from "@whosin/shared";
import { estTexteInterdit } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useCall } from "@/lib/calls";
import { pushNotify } from "@/lib/push";
import { useT } from "@/lib/locale";
import { toast } from "@/lib/toast";
import { getSupabase } from "@/lib/supabase";
import {
  acceptConversation,
  declineConversation,
  fetchConversation,
  fetchConversationMembers,
  fetchMessages,
  forgetSnap,
  leaveGroup,
  markConversationRead,
  notifyScreenshot,
  openSnap,
  PROFILE_COLS,
  sendMessage,
  setEphemeralMode,
  signChatPhotos,
  uploadChatPhoto,
} from "@/lib/data";
import { Avatar } from "@/components/Avatar";
import { SafetyMenu } from "@/components/SafetyMenu";
import { icebreakers } from "@/lib/icebreakers";
import { findSpotifyLink, SpotifyEmbed } from "@/lib/spotify";
import { PollCard, PollComposer } from "@/components/Poll";
import { createSquadInvite } from "@/lib/data";

export default function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const { startCall, state: callState } = useCall();
  const { t, locale } = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [membersById, setMembersById] = useState<Map<string, Profile>>(new Map());
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [iAmRecipient, setIAmRecipient] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [ephemeral, setEphemeral] = useState<EphemeralMode>("off");
  const [ephemeralOpen, setEphemeralOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // 📸 snaps
  const [snapDraft, setSnapDraft] = useState<{ file: File; url: string } | null>(null);
  const [snapViewOnce, setSnapViewOnce] = useState(true);
  const [snapView, setSnapView] = useState<{
    id: string;
    senderId: string | null;
    url: string;
    path: string;
    left: number;
  } | null>(null);
  // menu de signalement ouvert dans la visionneuse : le décompte attend
  const [snapMenu, setSnapMenu] = useState(false);
  // 📷 photos du bucket privé « chat » : chemin -> adresse signée
  const [signed, setSigned] = useState<Record<string, string>>({});
  const signAsked = useRef(new Set<string>());
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const meId = profile?.id;

  useEffect(() => {
    if (!meId) return;
    let alive = true;
    const supabase = getSupabase();

    (async () => {
      const conv = await fetchConversation(id);
      if (!conv) {
        router.replace("/messages");
        return;
      }
      const msgs = await fetchMessages(id);
      if (!alive) return;
      setMessages(msgs);
      setEphemeral(conv.ephemeral_mode ?? "off");
      setPending(conv.status === "pending" && !conv.is_group);
      setIAmRecipient(conv.requested_by !== meId);

      if (conv.is_group) {
        const mem = await fetchConversationMembers(id);
        if (!alive) return;
        setIsGroup(true);
        setMembersById(new Map(mem.map((p) => [p.id, p])));
        const others = mem.filter((p) => p.id !== meId);
        setGroupTitle(
          conv.title ||
            (others.length <= 3
              ? others.map((p) => p.display_name || p.username).join(", ")
              : `${others.slice(0, 2).map((p) => p.display_name || p.username).join(", ")} +${others.length - 2}`)
        );
      } else {
        const otherId = conv.user_a === meId ? conv.user_b : conv.user_a;
        const { data: prof } = await supabase.from("profiles").select(PROFILE_COLS).eq("id", otherId).maybeSingle();
        if (!alive) return;
        setOther((prof as Profile) ?? null);
      }
      setLoading(false);
      markConversationRead(id).catch(() => {});
    })();

    const channel = supabase
      .channel(`thread-${id}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== meId) markConversationRead(id).catch(() => {});
        }
      )
      // 🔥 un message éphémère qui se consume disparaît en direct des deux écrans
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [id, meId, router]);

  // 📷 chaque photo « chat » est signée une seule fois ; pas de nouvel essai si l'appel échoue (rouvrir le fil re-signe)
  useEffect(() => {
    const todo = messages
      .filter((m) => m.image_url && !m.view_once && !signAsked.current.has(m.image_url))
      .map((m) => m.image_url as string);
    if (!todo.length) return;
    for (const p of todo) signAsked.current.add(p);
    signChatPhotos(todo)
      .then((s) => setSigned((prev) => ({ ...prev, ...s })))
      .catch(() => {});
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // 🌃 arrivé depuis « Le Move » d'un ami -> ouverture pré-remplie
  useEffect(() => {
    const move = new URLSearchParams(window.location.search).get("move");
    if (move) {
      setText(locale === "fr" ? `Hey! Vu ton move « ${move} » — ` : `Hey! Saw your move "${move}" — `);
    }
  }, [locale]);

  // 🔥 horloge : rafraîchit les comptes à rebours et retire localement les expirés
  useEffect(() => {
    if (ephemeral === "off" && !messages.some((m) => m.expires_at)) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setMessages((prev) => prev.filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > n));
    }, 1000);
    return () => clearInterval(t);
  }, [ephemeral, messages]);

  // 🚨 détection best-effort de capture (PrintScreen sur Windows/Linux ;
  // détection complète = app native). Signale l'autre dans la conversation.
  useEffect(() => {
    if (!meId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") notifyScreenshot(id).catch(() => {});
    };
    window.addEventListener("keyup", onKey);
    return () => window.removeEventListener("keyup", onKey);
  }, [id, meId]);

  // 📸 décompte de la visionneuse de snap (8 s) puis fermeture ; en pause pendant un signalement
  useEffect(() => {
    if (!snapView || snapMenu) return;
    if (snapView.left <= 0) {
      forgetSnap(snapView.path).catch(() => {});
      setSnapView(null);
      return;
    }
    const t = setTimeout(() => setSnapView((s) => (s ? { ...s, left: s.left - 1 } : null)), 1000);
    return () => clearTimeout(t);
  }, [snapView, snapMenu]);

  async function pickEphemeral(mode: EphemeralMode) {
    setEphemeral(mode);
    setEphemeralOpen(false);
    try {
      await setEphemeralMode(id, mode);
    } catch {
      /* ignore */
    }
  }

  // push aux destinataires (hors moi), relus à l'envoi : un membre qui a quitté le groupe n'en reçoit plus — jamais bloquant
  function notifyOthers(body: string) {
    const me = profile?.display_name || profile?.username || "Whozin";
    const title = isGroup ? `${me} · ${groupTitle}` : me;
    (isGroup ? fetchConversationMembers(id).then((mem) => mem.map((p) => p.id)) : Promise.resolve(other ? [other.id] : []))
      .then((ids) => {
        for (const uid of ids) {
          if (uid !== meId) pushNotify(uid, { title, body, url: `/messages/${id}`, tag: `msg-${id}` }, id);
        }
      })
      .catch(() => {});
  }

  async function send() {
    if (!meId || !text.trim()) return;
    const body = text.trim();
    setText("");
    try {
      await sendMessage(id, meId, body);
      notifyOthers(body);
    } catch (e) {
      setText(body);
      toast(estTexteInterdit(e) ? t.common.forbiddenWord : t.common.error, "error");
    }
  }

  // sélection d'une photo -> ouvre l'aperçu (choix vue unique avant envoi)
  function pickImage(f: File | null) {
    if (!f) return;
    setSnapViewOnce(true);
    setSnapDraft({ file: f, url: URL.createObjectURL(f) });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function sendSnap() {
    if (!meId || !snapDraft) return;
    const { file, url: objUrl } = snapDraft;
    const viewOnce = snapViewOnce;
    setSnapDraft(null);
    URL.revokeObjectURL(objUrl);
    setUploading(true);
    try {
      const debut = Date.now();
      let path = await uploadChatPhoto(file, id, meId);
      // onglet ou PWA suspendu pendant le dépôt : un fichier orphelin de plus de 15 min est retiré par la
      // purge serveur (purge-chat) avant que le message ne le protège -> on redépose plutôt qu'envoyer un fantôme
      if (Date.now() - debut > 10 * 60_000) path = await uploadChatPhoto(file, id, meId);
      await sendMessage(id, meId, "", path, viewOnce);
      notifyOthers(viewOnce ? "📸 Photo vue unique" : "📷 Photo");
    } catch {
      toast(
        locale === "fr" ? "Photo non envoyée (images seulement, 10 Mo max.)" : "Photo not sent (images only, 10 MB max)",
        "error"
      );
    } finally {
      setUploading(false);
    }
  }

  // 📸 ouvrir un snap reçu : chemin (8 s) -> adresse signée courte, puis retrait local
  async function viewSnap(messageId: string) {
    try {
      const path = await openSnap(messageId);
      if (!path) return;
      const senderId = messages.find((x) => x.id === messageId)?.sender_id ?? null;
      setMessages((prev) =>
        prev.map((x) => (x.id === messageId ? { ...x, opened_at: new Date().toISOString() } : x))
      );
      const url = (await signChatPhotos([path], 30))[path];
      if (url) setSnapView({ id: messageId, senderId, url, path, left: 8 });
    } catch {
      /* ignore */
    }
  }

  // le fichier est effacé à la FERMETURE, pas au chargement : on peut signaler le snap pendant qu'on le voit
  // (un snap signalé reste ensuite protégé par la base ; l'effacement est alors refusé, sans bruit)
  function closeSnap() {
    if (snapView) forgetSnap(snapView.path).catch(() => {});
    setSnapView(null);
    setSnapMenu(false);
  }

  async function doAccept() {
    await acceptConversation(id);
    setPending(false);
  }
  async function doDecline() {
    await declineConversation(id);
    router.replace("/messages");
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-md pt-[max(10px,env(safe-area-inset-top))]">
        <Link href="/messages" className="text-text-dim">←</Link>
        {isGroup ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-lg">👥</span>
            <span className="truncate font-semibold">{groupTitle}</span>
            <button
              onClick={() => setEphemeralOpen(true)}
              aria-label="Messages éphémères"
              className="pressable ml-auto flex h-9 w-9 items-center justify-center rounded-full text-base"
              style={
                ephemeral !== "off"
                  ? { background: "rgba(255,46,99,.16)", border: "1px solid var(--brand)" }
                  : { background: "var(--surface-2)", border: "1px solid var(--border)" }
              }
            >
              🔥
            </button>
            <button
              onClick={async () => {
                if (!meId) return;
                const code = await createSquadInvite(id, meId);
                setInviteLink(`${window.location.origin}/join/${code}`);
              }}
              aria-label="Inviter la gang"
              className="glass pressable flex h-9 w-9 items-center justify-center rounded-full text-base"
            >
              🔗
            </button>
            <button
              type="button"
              onClick={async () => {
                const fr = locale === "fr";
                if (!window.confirm(fr ? "Quitter ce groupe ? Tu ne verras plus ses messages." : "Leave this group? You won't see its messages anymore.")) return;
                try {
                  await leaveGroup(id);
                  router.replace("/messages");
                } catch {
                  toast(fr ? "Impossible de quitter le groupe pour le moment." : "Couldn't leave the group right now.", "error");
                }
              }}
              aria-label={locale === "fr" ? "Quitter le groupe" : "Leave group"}
              className="glass pressable flex h-9 w-9 items-center justify-center rounded-full text-base"
            >
              🚪
            </button>
          </div>
        ) : (
          <Link href={`/u/${other?.username ?? ""}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar profile={other} size={34} />
            <span className="truncate font-semibold">{other?.display_name || other?.username || ""}</span>
          </Link>
        )}
        {!isGroup && other && !pending && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setEphemeralOpen(true)}
              aria-label="Messages éphémères"
              className="pressable flex h-9 w-9 items-center justify-center rounded-full"
              style={
                ephemeral !== "off"
                  ? { background: "rgba(255,46,99,.16)", border: "1px solid var(--brand)" }
                  : { background: "var(--surface-2)", border: "1px solid var(--border)" }
              }
            >
              🔥
            </button>
            <button
              onClick={() => callState === "idle" && startCall(other, "audio", id)}
              aria-label="Appel audio"
              className="glass pressable flex h-9 w-9 items-center justify-center rounded-full"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2Z" />
              </svg>
            </button>
            <button
              onClick={() => callState === "idle" && startCall(other, "video", id)}
              aria-label="Appel vidéo"
              className="glass pressable flex h-9 w-9 items-center justify-center rounded-full"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10.5 21 7v10l-6-3.5" />
                <rect x="2" y="6" width="13" height="12" rx="2" />
              </svg>
            </button>
          </div>
        )}
      </header>

      {ephemeral !== "off" && (
        <div
          className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold"
          style={{ background: "rgba(255,46,99,.1)", color: "var(--brand)" }}
        >
          🔥 {ephemeral === "read"
            ? locale === "fr" ? "Éphémère · disparaît après lecture" : "Vanish · gone after it's read"
            : locale === "fr" ? "Éphémère · disparaît après 24 h" : "Vanish · gone after 24h"}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-text-dim">{t.common.loading}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map((m) => {
              const mine = m.sender_id === meId;
              const sender = isGroup && !mine ? membersById.get(m.sender_id) : undefined;
              // 🚨 ligne système : capture d'écran
              if (m.kind === "screenshot") {
                const who = mine
                  ? locale === "fr" ? "Tu as" : "You"
                  : `${(isGroup ? sender : other)?.display_name || (isGroup ? sender : other)?.username || ""} ${locale === "fr" ? "a" : ""}`;
                return (
                  <p key={m.id} className="py-1 text-center text-[11px] font-semibold text-text-dim">
                    📸 {who} {locale === "fr" ? "fait une capture d'écran" : (mine ? "took a screenshot" : "took a screenshot")}
                  </p>
                );
              }
              const secsLeft = m.expires_at
                ? Math.max(0, Math.round((new Date(m.expires_at).getTime() - now) / 1000))
                : null;
              return (
                <div
                  key={m.id}
                  className={mine ? "flex justify-end" : "flex items-end justify-start gap-2"}
                  style={secsLeft !== null && secsLeft <= 10 ? { opacity: 0.45 + 0.05 * secsLeft } : undefined}
                >
                  {isGroup && !mine && <Avatar profile={sender} size={26} />}
                  <div className="flex max-w-[80%] flex-col">
                    {isGroup && !mine && (
                      <span className="mb-0.5 ml-1 text-[11px] text-text-dim">
                        {sender?.display_name || sender?.username}
                      </span>
                    )}
                    {m.poll_id ? (
                      <PollCard pollId={m.poll_id} />
                    ) : m.view_once ? (
                      // 📸 snap vue unique
                      mine ? (
                        <span
                          className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold"
                          style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}
                        >
                          📸 {m.opened_at
                            ? (locale === "fr" ? "Photo ouverte" : "Photo opened")
                            : (locale === "fr" ? "Photo vue unique envoyée" : "View-once photo sent")}
                        </span>
                      ) : m.opened_at ? (
                        <span
                          className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold"
                          style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}
                        >
                          📸 {locale === "fr" ? "Photo ouverte" : "Opened"}
                        </span>
                      ) : (
                        <button
                          onClick={() => viewSnap(m.id)}
                          className="pressable flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold"
                          style={{ background: "rgba(255,46,99,.12)", border: "1px solid var(--brand)", color: "var(--brand)" }}
                        >
                          <span className="text-lg">📸</span>
                          {locale === "fr" ? "Photo · appuie pour voir" : "Photo · tap to view"}
                        </button>
                      )
                    ) : m.image_url ? (
                      <span className="overflow-hidden rounded-2xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={signed[m.image_url] || undefined} alt="" className="w-full object-cover" />
                        {m.body && (
                          <span className="block px-1 pt-1 text-[15px]" style={{ color: "var(--text)" }}>
                            {m.body}
                          </span>
                        )}
                      </span>
                    ) : (
                      <>
                        <span
                          className="whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px]"
                          style={
                            mine
                              ? { background: "var(--brand)", color: "#fff", borderBottomRightRadius: 4 }
                              : { background: "var(--surface-2)", color: "var(--text)", borderBottomLeftRadius: 4 }
                          }
                        >
                          {m.body}
                        </span>
                        {findSpotifyLink(m.body) && (
                          <span className="mt-1.5 block w-64 max-w-full">
                            <SpotifyEmbed url={findSpotifyLink(m.body)!} height={80} />
                          </span>
                        )}
                      </>
                    )}
                    {secsLeft !== null && (
                      <span
                        className={`mt-0.5 text-[10px] font-bold ${mine ? "self-end" : "self-start"}`}
                        style={{ color: "var(--brand)" }}
                      >
                        🔥 {secsLeft >= 3600
                          ? `${Math.round(secsLeft / 3600)} h`
                          : secsLeft >= 60
                            ? `${Math.round(secsLeft / 60)} min`
                            : `${secsLeft} s`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {pending && iAmRecipient ? (
        <div className="border-t border-border p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          <p className="mb-3 text-center text-sm text-text-dim">
            <b className="text-text">{other?.display_name || other?.username}</b>{" "}
            {locale === "fr" ? "veut discuter avec toi." : "wants to chat with you."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={doAccept}
              className="brand-gradient flex-1 rounded-xl py-3 font-bold text-white"
            >
              {locale === "fr" ? "Accepter" : "Accept"}
            </button>
            <button
              onClick={doDecline}
              className="flex-1 rounded-xl border border-border py-3 font-semibold text-text-dim"
            >
              {locale === "fr" ? "Refuser" : "Decline"}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {pending && !iAmRecipient && (
            <p className="pb-2 text-center text-xs text-text-dim">
              {locale === "fr"
                ? "Demande envoyée — visible une fois acceptée."
                : "Request sent — visible once accepted."}
            </p>
          )}
          {/* 💬 icebreakers : conversation vierge -> 3 ouvertures (contextuelles si lieu) */}
          {!loading && messages.length === 0 && !isGroup && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2.5">
              {(() => {
                const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
                return icebreakers({
                  place: q?.get("place"),
                  category: q?.get("cat"),
                  locale: locale === "fr" ? "fr" : "en",
                  seed: id,
                }).map((line) => (
                  <button
                    key={line}
                    onClick={() => setText(line)}
                    className="glass pressable shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold"
                  >
                    {line}
                  </button>
                ));
              })()}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Photo"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-lg disabled:opacity-50"
            >
              {uploading ? "…" : "📷"}
            </button>
            {isGroup && (
              <button
                onClick={() => setPollOpen(true)}
                aria-label="Sondage"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-lg"
              >
                📊
              </button>
            )}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={locale === "fr" ? "Envoie un message…" : "Send a message…"}
              maxLength={2000}
              className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-base outline-none focus:border-brand"
            />
            <button
              onClick={send}
              disabled={!text.trim()}
              className="brand-gradient flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40"
              aria-label="Envoyer"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {pollOpen && (
        <PollComposer convId={id} onClose={() => setPollOpen(false)} onCreated={() => setPollOpen(false)} />
      )}

      {/* 📸 aperçu avant envoi : choix vue unique */}
      {snapDraft && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={snapDraft.url} alt="" className="min-h-0 flex-1 object-contain" />
          <div className="p-4 pb-[max(20px,env(safe-area-inset-bottom))]">
            <button
              onClick={() => setSnapViewOnce((v) => !v)}
              className="pressable mb-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3"
              style={{
                borderColor: snapViewOnce ? "var(--brand)" : "rgba(255,255,255,.2)",
                background: snapViewOnce ? "rgba(255,46,99,.14)" : "rgba(255,255,255,.06)",
              }}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                📸 {locale === "fr" ? "Vue unique" : "View once"}
              </span>
              <span
                className="flex h-6 w-11 items-center rounded-full px-0.5 transition-colors"
                style={{ background: snapViewOnce ? "var(--brand)" : "rgba(255,255,255,.25)" }}
              >
                <span
                  className="h-5 w-5 rounded-full bg-white transition-transform"
                  style={{ transform: snapViewOnce ? "translateX(20px)" : "none" }}
                />
              </span>
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  URL.revokeObjectURL(snapDraft.url);
                  setSnapDraft(null);
                }}
                className="flex-1 rounded-full border border-white/20 py-3 text-sm font-semibold text-white"
              >
                {locale === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button
                onClick={sendSnap}
                disabled={uploading}
                className="brand-gradient pressable flex-[2] rounded-full py-3 font-display text-sm font-bold text-white disabled:opacity-60"
              >
                {uploading ? "…" : snapViewOnce ? (locale === "fr" ? "Envoyer le snap 📸" : "Send snap 📸") : (locale === "fr" ? "Envoyer la photo" : "Send photo")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📸 visionneuse de snap : 8 s puis disparu */}
      {snapView && (
        <div
          className="fixed inset-0 z-[95] flex flex-col bg-black"
          onClick={closeSnap}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapView.url}
            alt=""
            className="min-h-0 flex-1 object-contain"
          />
          {snapView.senderId && (
            // le clic sur le menu ne ferme pas la visionneuse
            <div
              className="absolute left-4 top-[max(16px,env(safe-area-inset-top))] rounded-full bg-black/60"
              onClick={(e) => e.stopPropagation()}
            >
              <SafetyMenu
                targetType="message"
                targetId={snapView.id}
                targetUserId={snapView.senderId}
                onOpenChange={setSnapMenu}
              />
            </div>
          )}
          <div className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-black/60 font-display text-base font-bold text-white">
            {snapView.left}
          </div>
          <p className="pb-[max(20px,env(safe-area-inset-bottom))] pt-3 text-center text-xs text-white/60">
            {locale === "fr" ? "📸 Cette photo disparaît dans quelques secondes" : "📸 This photo vanishes in seconds"}
          </p>
        </div>
      )}

      {ephemeralOpen && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 animate-fade" onClick={() => setEphemeralOpen(false)} />
          <div className="relative w-full max-w-[480px] rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] animate-slide-up">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-text/20" />
            <h2 className="font-display text-lg font-bold">🔥 {locale === "fr" ? "Messages éphémères" : "Disappearing messages"}</h2>
            <p className="mt-0.5 text-xs text-text-dim">
              {locale === "fr"
                ? "Ce qui se dit la nuit reste à la nuit. Vaut pour les messages envoyés à partir de maintenant, pour toute la conversation."
                : "What's said at night stays at night. Applies to messages sent from now on, for everyone in this chat."}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {([
                { v: "off" as const, e: "💬", fr: "Désactivé", en: "Off", frd: "Les messages restent", end: "Messages stay" },
                { v: "read" as const, e: "👀", fr: "Après lecture", en: "After it's read", frd: "Disparaît ~10 s après être lu", end: "Gone ~10s after read" },
                { v: "24h" as const, e: "🌅", fr: "Après 24 heures", en: "After 24 hours", frd: "Disparaît le lendemain", end: "Gone the next day" },
              ]).map((o) => (
                <button
                  key={o.v}
                  onClick={() => pickEphemeral(o.v)}
                  className="pressable flex items-center gap-3 rounded-2xl border px-4 py-3 text-left"
                  style={{
                    borderColor: ephemeral === o.v ? "var(--brand)" : "var(--border)",
                    background: ephemeral === o.v ? "rgba(255,46,99,.08)" : "var(--surface-2)",
                  }}
                >
                  <span className="text-xl">{o.e}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{locale === "fr" ? o.fr : o.en}</span>
                    <span className="block text-[11px] text-text-dim">{locale === "fr" ? o.frd : o.end}</span>
                  </span>
                  {ephemeral === o.v && <span className="text-brand">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {inviteLink && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 animate-fade" onClick={() => setInviteLink(null)} />
          <div className="relative w-full max-w-[480px] rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-center animate-slide-up">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-text/20" />
            <h2 className="font-display text-lg font-bold">🔗 {locale === "fr" ? "Invite ta gang" : "Invite your squad"}</h2>
            <p className="mt-1 text-xs text-text-dim">
              {locale === "fr"
                ? "Ce lien les ajoute au groupe et vous connecte."
                : "This link adds them to the group and connects you."}
            </p>
            {/* pas de QR par un service tiers : le lien donne l'accès au groupe */}
            <p className="mt-3 break-all rounded-xl bg-surface-2 px-3 py-2 text-xs text-text-dim">{inviteLink}</p>
            <button
              onClick={async () => {
                try {
                  if (navigator.share) await navigator.share({ url: inviteLink });
                  else await navigator.clipboard.writeText(inviteLink);
                } catch {
                  /* annulé */
                }
                setInviteLink(null);
              }}
              className="glow-cta brand-gradient pressable mt-4 w-full rounded-full py-3.5 font-display text-sm font-bold text-white"
            >
              {locale === "fr" ? "Partager le lien" : "Share link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
