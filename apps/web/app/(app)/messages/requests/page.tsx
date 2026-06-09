"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { timeAgo, type ConversationPreview } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  acceptConversation,
  declineConversation,
  fetchConversations,
} from "@/lib/data";
import { Avatar } from "@/components/Avatar";

export default function RequestsPage() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [list, setList] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const all = await fetchConversations(profile.id);
    setList(all.filter((c) => c.status === "pending" && !c.iRequested));
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function accept(id: string) {
    setBusy(id);
    await acceptConversation(id);
    router.push(`/messages/${id}`);
  }
  async function decline(id: string) {
    setBusy(id);
    await declineConversation(id);
    await load();
    setBusy(null);
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md pt-[max(12px,env(safe-area-inset-top))]">
        <Link href="/messages" className="text-text-dim">←</Link>
        <h1 className="text-xl font-black">
          {locale === "fr" ? "Demandes" : "Requests"}
        </h1>
      </header>

      <p className="px-4 py-3 text-xs text-text-dim">
        {locale === "fr"
          ? "Ces personnes veulent te parler. Accepter ouvre la conversation."
          : "These people want to chat. Accepting opens the conversation."}
      </p>

      {loading ? (
        <p className="py-16 text-center text-sm text-text-dim">{t.common.loading}</p>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-dim">
          {locale === "fr" ? "Aucune demande." : "No requests."}
        </p>
      ) : (
        <ul>
          {list.map((c) => (
            <li key={c.id} className="border-b border-border px-4 py-3">
              <Link href={`/u/${c.other?.username ?? ""}`} className="flex items-center gap-3">
                <Avatar profile={c.other} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.other?.display_name || c.other?.username}</p>
                  <p className="truncate text-sm text-text-dim">
                    {c.lastMessage?.body ?? "…"}
                  </p>
                </div>
                <span className="text-xs text-text-dim">{timeAgo(c.last_message_at, locale)}</span>
              </Link>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => accept(c.id)}
                  disabled={busy === c.id}
                  className="brand-gradient flex-1 rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {locale === "fr" ? "Accepter" : "Accept"}
                </button>
                <button
                  onClick={() => decline(c.id)}
                  disabled={busy === c.id}
                  className="flex-1 rounded-lg border border-border py-2 text-sm font-semibold text-text-dim disabled:opacity-50"
                >
                  {locale === "fr" ? "Refuser" : "Decline"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
