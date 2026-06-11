"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Post, Profile } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  fetchProfileStats,
  fetchUserPosts,
  follow,
  unfollow,
  updateLocationSharing,
  updateProfile,
  type ProfileStats,
} from "@/lib/data";
import type { LocationSharing } from "@whosin/shared";
import { Avatar } from "./Avatar";
import { PostModal } from "./PostModal";
import { SafetyMenu } from "./SafetyMenu";
import { iBlocked } from "@/lib/data";
import { MessageButton } from "./MessageButton";

export function ProfileView({ profile }: { profile: Profile }) {
  const { t, locale, toggle } = useT();
  const { profile: me, signOut, refreshProfile } = useAuth();
  const isMe = me?.id === profile.id;

  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [sharing, setSharing] = useState<LocationSharing>(profile.location_sharing ?? "approx");
  const [busy, setBusy] = useState(false);
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    fetchProfileStats(profile.id, me?.id ?? null).then(setStats).catch(() => {});
    fetchUserPosts(profile.id).then(setPosts).catch(() => {});
    if (me && me.id !== profile.id) iBlocked(me.id, profile.id).then(setBlocked).catch(() => {});
  }, [profile.id, me?.id, me]);

  async function toggleFollow() {
    if (!me || !stats) return;
    const next = !stats.isFollowing;
    setStats({
      ...stats,
      isFollowing: next,
      followers: stats.followers + (next ? 1 : -1),
    });
    try {
      if (next) await follow(me.id, profile.id);
      else await unfollow(me.id, profile.id);
    } catch {
      setStats((s) => (s ? { ...s, isFollowing: !next } : s));
    }
  }

  async function saveProfile() {
    setBusy(true);
    try {
      await updateProfile(profile.id, { display_name: displayName, bio });
      await updateLocationSharing(profile.id, sharing);
      await refreshProfile();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 pt-[max(12px,env(safe-area-inset-top))]">
        <h1 className="text-lg font-black">@{profile.username}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-text-dim"
          >
            {locale === "fr" ? "EN" : "FR"}
          </button>
          {isMe && (
            <>
              <Link
                href="/wrapped"
                className="glass rounded-full px-2.5 py-1 text-xs font-bold"
                aria-label="Wrapped"
              >
                🎁
              </Link>
              <button onClick={signOut} className="text-xs text-text-dim">
                {t.auth.signOut}
              </button>
            </>
          )}
          {!isMe && (
            <SafetyMenu
              targetType="profile"
              targetId={profile.id}
              targetUserId={profile.id}
              blocked={blocked}
              onBlockChange={setBlocked}
            />
          )}
        </div>
      </header>

      <div className="p-5">
        <div className="flex items-center gap-4">
          <Avatar profile={profile} size={72} />
          <div className="flex flex-1 justify-around text-center">
            <Stat n={stats?.checkins ?? 0} label={t.profile.checkins} />
            <Stat n={stats?.followers ?? 0} label={t.profile.followers} />
            <Stat n={stats?.following ?? 0} label={t.profile.following} />
          </div>
        </div>

        <div className="mt-3">
          <p className="font-bold">{profile.display_name || profile.username}</p>
          {profile.bio && <p className="mt-0.5 text-sm text-text-dim">{profile.bio}</p>}
        </div>

        {isMe ? (
          <button
            onClick={() => setEditing(true)}
            className="mt-4 w-full rounded-xl border border-border py-2.5 text-sm font-semibold"
          >
            {t.profile.editProfile}
          </button>
        ) : (
          me && blocked ? (
            <p className="mt-4 rounded-2xl border border-border px-4 py-3 text-center text-sm text-text-dim">
              {locale === "fr" ? "Tu as bloqué ce compte (⋯ pour débloquer)" : "You blocked this account (⋯ to unblock)"}
            </p>
          ) : (
          me && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={toggleFollow}
                className={
                  stats?.isFollowing
                    ? "flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-text-dim"
                    : "brand-gradient flex-1 rounded-xl py-2.5 text-sm font-bold text-white"
                }
              >
                {stats?.isFollowing ? t.profile.unfollow : t.profile.follow}
              </button>
              <div className="flex flex-1 [&>button]:w-full">
                <MessageButton targetUserId={profile.id} />
              </div>
            </div>
          )
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-border py-2.5 text-xs font-semibold uppercase tracking-wide text-text">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </svg>
        Publications
      </div>
      <div className="border-t border-border">
        {posts.length === 0 ? (
          <p className="py-12 text-center text-sm text-text-dim">{t.profile.noActivity}</p>
        ) : (
          <div className="grid grid-cols-3 gap-[2px]">
            {posts.map((p) => (
              <button
                key={p.id}
                onClick={() => setOpenPost({ ...p, author: profile })}
                className="relative aspect-square bg-surface-2"
              >
                {p.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="brand-gradient flex h-full w-full items-center justify-center p-2 text-center text-[10px] font-bold text-white">
                    {p.body?.slice(0, 60)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {openPost && <PostModal post={openPost} onClose={() => setOpenPost(null)} />}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(false)} />
          <div className="relative w-full max-w-[480px] rounded-t-3xl border-t border-border bg-surface p-5 pb-8 animate-slide-up">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <h2 className="mb-3 text-lg font-bold">{t.profile.editProfile}</h2>
            <label className="mb-1 block text-xs text-text-dim">{t.auth.displayName}</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mb-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-3 outline-none focus:border-brand"
            />
            <label className="mb-1 block text-xs text-text-dim">{t.profile.bio}</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={280}
              className="mb-4 w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-3 outline-none focus:border-brand"
            />

            <label className="mb-1 block text-xs text-text-dim">
              {locale === "fr" ? "Ma position" : "My location"}
            </label>
            <div className="mb-1 grid grid-cols-3 gap-2">
              {([
                { v: "approx", emoji: "📍", label: locale === "fr" ? "Approx." : "Approx." },
                { v: "precise", emoji: "🎯", label: locale === "fr" ? "Précise" : "Precise" },
                { v: "hidden", emoji: "👻", label: locale === "fr" ? "Cachée" : "Hidden" },
              ] as { v: LocationSharing; emoji: string; label: string }[]).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setSharing(o.v)}
                  className="rounded-xl border py-2.5 text-sm font-semibold"
                  style={{
                    borderColor: sharing === o.v ? "var(--brand)" : "var(--border)",
                    color: sharing === o.v ? "var(--brand)" : "var(--text-dim)",
                    background: sharing === o.v ? "var(--surface-2)" : "transparent",
                  }}
                >
                  <span className="mr-1">{o.emoji}</span>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mb-4 text-xs text-text-dim">
              {sharing === "hidden"
                ? locale === "fr"
                  ? "Mode fantôme : tu n'apparais nulle part. Tes check-ins restent privés."
                  : "Ghost mode: you appear nowhere. Your check-ins stay private."
                : sharing === "precise"
                  ? locale === "fr"
                    ? "Position précise au lieu où tu es."
                    : "Precise location at your venue."
                  : locale === "fr"
                    ? "Tu apparais au lieu, sans GPS exact. Recommandé."
                    : "You show at the venue, no exact GPS. Recommended."}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 rounded-xl border border-border py-3 font-semibold text-text-dim"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={saveProfile}
                disabled={busy}
                className="brand-gradient flex-[2] rounded-xl py-3 font-bold text-white disabled:opacity-60"
              >
                {busy ? t.common.loading : t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="text-lg font-black">{n}</p>
      <p className="text-xs text-text-dim">{label}</p>
    </div>
  );
}
