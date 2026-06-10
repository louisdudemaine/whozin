"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CheckIn, NearbyPlace, Post } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { fetchActiveCheckIns, fetchFeed, unreadMessagesCount } from "@/lib/data";
import { PostCard } from "@/components/PostCard";
import { LiveNow } from "@/components/LiveNow";
import { CheckInSheet } from "@/components/CheckInSheet";
import { StoriesBar } from "@/components/Stories";

export default function FeedPage() {
  const { t, locale } = useT();
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

  const peopleOut = new Set(stories.map((s) => s.user_id)).size;
  const placesLive = new Set(stories.map((s) => s.place_id)).size;
  const firstName = (profile?.display_name || profile?.username || "").split(" ")[0];

  return (
    <div className="min-h-[100dvh]">
      {/* top app bar — pouls de la ville, pas un clone IG */}
      <header className="sticky top-0 z-20 border-b border-border bg-[rgba(7,7,13,0.72)] px-4 pb-2.5 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="font-display text-2xl font-extrabold tracking-tight">
            Whoz<span className="text-gradient neon-text">in</span>
          </span>
          <div className="flex items-center gap-3.5">
            <span className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              MTL
            </span>
            <Link href="/dating" aria-label="Rencontres" className="text-xl leading-none">
              💘
            </Link>
            <Link href="/notifications" aria-label={t.notifications.title}>
              <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
            </Link>
            <Link href="/messages" aria-label="Messages" className="relative">
              <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8 8 0 0 1-11.5 7.2L3 21l2.3-6.5A8 8 0 1 1 21 11.5Z" />
              </svg>
              {unreadDm > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                  {unreadDm > 9 ? "9+" : unreadDm}
                </span>
              )}
            </Link>
          </div>
        </div>
        {!loading && (
          <p className="mt-1 text-xs text-text-dim">
            {locale === "fr" ? (
              <>
                {firstName ? `Hey ${firstName} — ` : ""}
                <b className="text-accent">{peopleOut}</b> personnes sorties ·{" "}
                <b className="text-text">{placesLive}</b> lieux qui bougent
              </>
            ) : (
              <>
                {firstName ? `Hey ${firstName} — ` : ""}
                <b className="text-accent">{peopleOut}</b> people out ·{" "}
                <b className="text-text">{placesLive}</b> places buzzing
              </>
            )}
          </p>
        )}
      </header>

      {loading ? (
        <p className="py-16 text-center text-sm text-text-dim">{t.common.loading}</p>
      ) : (
        <>
          <StoriesBar />
          <LiveNow checkIns={stories} onSelectPlace={setSelected} />

          <Link
            href="/events"
            className="mx-3 mt-3 flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              🎟️ {locale === "fr" ? "Shows & événements près de toi" : "Shows & events near you"}
            </span>
            <span className="text-text-dim">→</span>
          </Link>

          <div className="px-3 pt-3">
            {posts.length === 0 ? (
              <p className="py-16 text-center text-sm text-text-dim">{t.feed.empty}</p>
            ) : (
              posts.map((p) => <PostCard key={p.id} post={p} />)
            )}
          </div>
        </>
      )}

      {selected && (
        <CheckInSheet place={selected} onClose={() => setSelected(null)} onChanged={load} />
      )}
    </div>
  );
}
