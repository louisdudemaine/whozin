"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CheckIn, NearbyPlace, Post } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { fetchActiveCheckIns, fetchFeed, unreadMessagesCount } from "@/lib/data";
import { PostCard } from "@/components/PostCard";
import { LiveStories } from "@/components/LiveStories";
import { CheckInSheet } from "@/components/CheckInSheet";

export default function FeedPage() {
  const { t } = useT();
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<CheckIn[]>([]);
  const [selected, setSelected] = useState<NearbyPlace | null>(null);
  const [unreadDm, setUnreadDm] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([fetchFeed(), fetchActiveCheckIns()]);
      setPosts(p);
      setStories(s);
      if (profile) setUnreadDm(await unreadMessagesCount(profile.id));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener("wi:refresh", onRefresh);
    const supabase = getSupabase();
    const channel = supabase
      .channel("feed-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "check_ins" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load)
      .subscribe();
    return () => {
      window.removeEventListener("wi:refresh", onRefresh);
      supabase.removeChannel(channel);
    };
  }, [load]);

  return (
    <div className="min-h-[100dvh]">
      {/* top app bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md pt-[max(12px,env(safe-area-inset-top))]">
        <span className="text-2xl font-black tracking-tight">
          Whoz<span className="text-gradient">in</span>
        </span>
        <div className="flex items-center gap-4">
          <Link href="/dating" aria-label="Rencontres" className="text-xl leading-none">
            💘
          </Link>
          <Link href="/notifications" aria-label={t.notifications.title}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" />
            </svg>
          </Link>
          <Link href="/messages" aria-label="Messages" className="relative">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" />
            </svg>
            {unreadDm > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                {unreadDm > 9 ? "9+" : unreadDm}
              </span>
            )}
          </Link>
        </div>
      </header>

      {loading ? (
        <p className="py-16 text-center text-sm text-text-dim">{t.common.loading}</p>
      ) : (
        <>
          <LiveStories checkIns={stories} onSelectPlace={setSelected} />
          {posts.length === 0 ? (
            <p className="py-16 text-center text-sm text-text-dim">{t.feed.empty}</p>
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} />)
          )}
        </>
      )}

      {selected && (
        <CheckInSheet place={selected} onClose={() => setSelected(null)} onChanged={load} />
      )}
    </div>
  );
}
