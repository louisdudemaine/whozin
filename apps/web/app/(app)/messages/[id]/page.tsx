"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Message, Profile } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";
import {
  acceptConversation,
  declineConversation,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  sendMessage,
  uploadMedia,
} from "@/lib/data";
import { Avatar } from "@/components/Avatar";

export default function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const { t, locale } = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [iAmRecipient, setIAmRecipient] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      const otherId = conv.user_a === meId ? conv.user_b : conv.user_a;
      const [{ data: prof }, msgs] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", otherId).maybeSingle(),
        fetchMessages(id),
      ]);
      if (!alive) return;
      setOther((prof as Profile) ?? null);
      setMessages(msgs);
      setPending(conv.status === "pending");
      setIAmRecipient(conv.requested_by !== meId);
      setLoading(false);
      markConversationRead(id).catch(() => {});
    })();

    const channel = supabase
      .channel(`thread-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== meId) markConversationRead(id).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [id, meId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!meId || !text.trim()) return;
    const body = text.trim();
    setText("");
    try {
      await sendMessage(id, meId, body);
    } catch {
      setText(body);
    }
  }

  async function sendImage(f: File | null) {
    if (!meId || !f) return;
    setUploading(true);
    try {
      const url = await uploadMedia(f, meId);
      await sendMessage(id, meId, "", url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
        <Link href={`/u/${other?.username ?? ""}`} className="flex items-center gap-2.5">
          <Avatar profile={other} size={34} />
          <span className="font-semibold">{other?.display_name || other?.username || ""}</span>
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-text-dim">{t.common.loading}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map((m) => {
              const mine = m.sender_id === meId;
              return (
                <div
                  key={m.id}
                  className={mine ? "flex justify-end" : "flex justify-start"}
                >
                  {m.image_url ? (
                    <span className="max-w-[70%] overflow-hidden rounded-2xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.image_url} alt="" className="w-full object-cover" />
                      {m.body && (
                        <span className="block px-1 pt-1 text-[15px]" style={{ color: "var(--text)" }}>
                          {m.body}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span
                      className="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px]"
                      style={
                        mine
                          ? { background: "var(--brand)", color: "#fff", borderBottomRightRadius: 4 }
                          : { background: "var(--surface-2)", color: "var(--text)", borderBottomLeftRadius: 4 }
                      }
                    >
                      {m.body}
                    </span>
                  )}
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
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => sendImage(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Photo"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-lg disabled:opacity-50"
            >
              {uploading ? "…" : "📷"}
            </button>
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
    </div>
  );
}
