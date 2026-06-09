"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { timeAgo, type ConversationPreview } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";
import { fetchConversations } from "@/lib/data";
import { ConvAvatar, convName } from "@/components/ConvAvatar";

export default function MessagesPage() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const [list, setList] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setList(await fetchConversations(profile.id));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
    const supabase = getSupabase();
    const channel = supabase
      .channel("inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const requests = list.filter((c) => c.status === "pending" && !c.iRequested);
  const main = list.filter((c) => c.status === "accepted" || c.iRequested);

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md pt-[max(12px,env(safe-area-inset-top))]">
        <Link href="/feed" className="text-text-dim">←</Link>
        <h1 className="flex-1 text-xl font-black">{profile?.username ? `@${profile.username}` : "Messages"}</h1>
        <Link
          href="/messages/new"
          aria-label="Nouveau groupe"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-xl"
        >
          ＋
        </Link>
      </header>

      {loading ? (
        <p className="py-16 text-center text-sm text-text-dim">{t.common.loading}</p>
      ) : list.length === 0 ? (
        <div className="px-6 py-20 text-center text-text-dim">
          <p className="mb-1 text-4xl">✉️</p>
          <p className="text-sm">
            {locale === "fr"
              ? "Aucune conversation. Va voir qui est sorti et écris-leur !"
              : "No conversations yet. See who's out and message them!"}
          </p>
        </div>
      ) : (
        <>
          {requests.length > 0 && (
            <Link
              href="/messages/requests"
              className="flex items-center justify-between border-b border-border px-4 py-3"
            >
              <span className="font-semibold text-brand">
                {locale === "fr" ? "Demandes de message" : "Message requests"}
              </span>
              <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
                {requests.length}
              </span>
            </Link>
          )}
          <ul>
            {main.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  className="flex items-center gap-3 border-b border-border px-4 py-3"
                >
                  <ConvAvatar conv={c} size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center justify-between">
                      <span className="truncate font-semibold">
                        {convName(c)}
                        {c.isGroup && <span className="ml-1 text-xs font-normal text-text-dim">· groupe</span>}
                      </span>
                      <span className="ml-2 shrink-0 text-xs text-text-dim">
                        {timeAgo(c.last_message_at, locale)}
                      </span>
                    </p>
                    <p
                      className="truncate text-sm"
                      style={{ color: c.unread > 0 ? "var(--text)" : "var(--text-dim)", fontWeight: c.unread > 0 ? 600 : 400 }}
                    >
                      {c.status === "pending" && c.iRequested
                        ? locale === "fr" ? "Demande envoyée" : "Request sent"
                        : c.lastMessage
                          ? (c.lastMessage.sender_id === profile?.id ? "Toi : " : "") +
                            (c.lastMessage.body || (c.lastMessage.image_url ? "📷 Photo" : ""))
                          : "…"}
                    </p>
                  </div>
                  {c.unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
