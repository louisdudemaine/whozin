"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FriendMove, MyMove } from "@whosin/shared";
import { estTexteInterdit } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  clearMove,
  fetchFriendsMoves,
  fetchMyMove,
  getOrCreateConversation,
  setMove,
} from "@/lib/data";
import { Avatar } from "./Avatar";
import { toast } from "@/lib/toast";

const EMOJIS = ["🍻", "🍜", "🪩", "☕", "🎶", "🏀", "🎬", "🌙", "🔥", "✨"];

/** 🌃 Le Move — bulles éphémères « c'est quoi le move ce soir? » en tête du feed. */
export function MoveStrip() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const fr = locale === "fr";
  const [mine, setMine] = useState<MyMove | null>(null);
  const [friends, setFriends] = useState<FriendMove[]>([]);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState("🍻");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [m, f] = await Promise.all([fetchMyMove(), fetchFriendsMoves()]);
    setMine(m);
    setFriends(f);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await setMove(text.trim(), emoji);
      setComposing(false);
      setText("");
      await load();
      toast(fr ? "Ton move est lancé 🌃" : "Your move is live 🌃");
    } catch (e) {
      toast(estTexteInterdit(e) ? t.common.forbiddenWord : t.common.error, "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await clearMove();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function openDm(m: FriendMove) {
    try {
      const convId = await getOrCreateConversation(m.user_id);
      const q = new URLSearchParams({ move: `${m.emoji ?? ""} ${m.body}`.trim() });
      router.push(`/messages/${convId}?${q}`);
    } catch {
      /* ignore */
    }
  }

  function openCompose() {
    setText(mine?.body ?? "");
    setEmoji(mine?.emoji ?? "🍻");
    setComposing(true);
  }

  return (
    <>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-3 pt-3">
        {/* ma bulle */}
        <button
          onClick={openCompose}
          className="flex w-[76px] shrink-0 flex-col items-center gap-1.5"
        >
          <span className="relative">
            <span
              className={mine ? "ring" : "inline-block rounded-full p-[2px]"}
              style={mine ? undefined : { border: "2px dashed var(--border)" }}
            >
              <Avatar profile={profile} size={54} />
            </span>
            <span
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-xs"
              style={{ background: "var(--brand)", color: "#fff", border: "2px solid var(--background)" }}
            >
              {mine ? mine.emoji ?? "🌃" : "+"}
            </span>
          </span>
          <span className="line-clamp-2 text-center text-[10px] leading-tight text-text-dim">
            {mine ? mine.body : fr ? "Ton move?" : "Your move?"}
          </span>
        </button>

        {friends.map((m) => (
          <button
            key={m.user_id}
            onClick={() => openDm(m)}
            className="flex w-[76px] shrink-0 flex-col items-center gap-1.5"
          >
            <span className="relative">
              <span className="ring ring--static">
                <Avatar profile={{ username: m.username, display_name: m.display_name, avatar_url: m.avatar_url }} size={54} />
              </span>
              {m.emoji && (
                <span
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-xs"
                  style={{ background: "var(--surface-2)", border: "2px solid var(--background)" }}
                >
                  {m.emoji}
                </span>
              )}
            </span>
            <span className="line-clamp-2 text-center text-[10px] leading-tight text-text">
              {m.body}
            </span>
          </button>
        ))}
      </div>

      {composing && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 animate-fade" onClick={() => setComposing(false)} />
          <div className="relative w-full max-w-[480px] rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] animate-slide-up">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-text/20" />
            <h2 className="font-display text-lg font-bold">🌃 {fr ? "C'est quoi le move?" : "What's the move?"}</h2>
            <p className="mt-0.5 text-xs text-text-dim">
              {fr
                ? "Dis à tes amis ce que tu cherches ce soir. Ça disparaît au lever du soleil."
                : "Tell your friends what you're up for tonight. Gone by sunrise."}
            </p>

            <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                  style={{
                    background: emoji === e ? "rgba(255,46,99,.14)" : "var(--surface-2)",
                    border: emoji === e ? "1px solid var(--brand)" : "1px solid var(--border)",
                  }}
                >
                  {e}
                </button>
              ))}
            </div>

            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 80))}
              maxLength={80}
              autoFocus
              placeholder={fr ? "Ex : qui sort dans le Vieux?" : "e.g. who's out downtown?"}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className="mt-3 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-base outline-none focus:border-brand"
            />
            <p className="mt-1 text-right text-[10px] text-text-dim">{text.length}/80</p>

            <button
              onClick={save}
              disabled={busy || !text.trim()}
              className="glow-cta brand-gradient pressable mt-2 w-full rounded-full py-3.5 font-display text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "…" : mine ? (fr ? "Mettre à jour" : "Update") : (fr ? "Publier mon move" : "Post my move")}
            </button>
            {mine && (
              <button
                onClick={remove}
                disabled={busy}
                className="mt-2 w-full rounded-full py-2.5 text-sm font-semibold text-text-dim"
              >
                {fr ? "Retirer mon move" : "Remove my move"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
