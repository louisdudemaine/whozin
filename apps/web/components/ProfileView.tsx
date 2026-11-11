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
import { fetchMyCrew, fetchMyDrops, fetchSeenIrl, iBlocked, type CrewMate, type MyDrop } from "@/lib/data";

/** skins d'anneau gagnés via drops */
const RING_SKINS: Record<string, string> = {
  gold: "conic-gradient(from 0deg, #ffc94d, #ff7849, #ffe9a8, #ffc94d)",
};
import { MessageButton } from "./MessageButton";
import { ThemeToggle } from "@/lib/theme";

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
  const [proMode, setProMode] = useState(!!profile.pro_mode);
  const [proTitle, setProTitle] = useState(profile.pro_title ?? "");
  const [proCompany, setProCompany] = useState(profile.pro_company ?? "");
  const [proLinkedin, setProLinkedin] = useState(profile.pro_linkedin ?? "");
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [seenIrl, setSeenIrl] = useState(false);
  const [myDrops, setMyDrops] = useState<MyDrop[]>([]);
  const [crew, setCrew] = useState<CrewMate[]>([]);

  useEffect(() => {
    if (isMe) {
      fetchMyDrops().then(setMyDrops).catch(() => {});
      fetchMyCrew().then(setCrew).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMe]);

  useEffect(() => {
    fetchProfileStats(profile.id, me?.id ?? null).then(setStats).catch(() => {});
    fetchUserPosts(profile.id).then(setPosts).catch(() => {});
    if (me && me.id !== profile.id) {
      iBlocked(me.id, profile.id).then(setBlocked).catch(() => {});
      fetchSeenIrl(profile.id).then(setSeenIrl).catch(() => {});
    }
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
    setSaveErr(null);
    try {
      await updateProfile(profile.id, {
        display_name: displayName,
        bio,
        pro_mode: proMode,
        pro_title: proTitle.trim() || null,
        pro_company: proCompany.trim() || null,
        pro_linkedin: proLinkedin.trim() || null,
      });
      await updateLocationSharing(profile.id, sharing);
      await refreshProfile();
      setEditing(false);
    } catch (e) {
      // contrainte de la migration D : 50 caractères, « whozin » réservé à l'app
      setSaveErr(
        String((e as { message?: string })?.message).includes("profiles_display_name_check")
          ? locale === "fr"
            ? "Nom refusé (50 caractères max., « Whozin » réservé)."
            : "Name refused (50 characters max, “Whozin” is reserved)."
          : t.common.error
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 pt-[max(12px,env(safe-area-inset-top))]">
        <h1 className="text-lg font-black">@{profile.username}</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle locale={locale} compact />
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
              <Link
                href="/partner"
                className="glass rounded-full px-2.5 py-1 text-xs font-bold"
                aria-label="Portail partenaire"
              >
                🏪
              </Link>
              <Link
                href="/securite"
                className="glass rounded-full px-2.5 py-1 text-xs font-bold"
                aria-label="Sécurité"
              >
                🔐
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
          {profile.ring_skin && RING_SKINS[profile.ring_skin] ? (
            <span
              className="inline-block rounded-full p-[3px]"
              style={{
                background: RING_SKINS[profile.ring_skin],
                filter: "drop-shadow(0 0 12px rgba(255,201,77,.5))",
              }}
              title="Anneau exclusif 🎁"
            >
              <span className="block rounded-full border-2 border-background">
                <Avatar profile={profile} size={72} />
              </span>
            </span>
          ) : (
            <Avatar profile={profile} size={72} />
          )}
          <div className="flex flex-1 justify-around text-center">
            <Stat n={stats?.checkins ?? 0} label={t.profile.checkins} />
            <Stat n={stats?.followers ?? 0} label={t.profile.followers} />
            <Stat n={stats?.following ?? 0} label={t.profile.following} />
          </div>
        </div>

        <div className="mt-3">
          <p className="flex items-center gap-2 font-bold">
            {profile.display_name || profile.username}
            {seenIrl && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: "rgba(22,217,197,.14)", color: "var(--accent)", border: "1px solid rgba(22,217,197,.35)" }}
                title={locale === "fr" ? "Vous vous êtes croisés en vrai" : "You crossed paths in real life"}
              >
                ✓ {locale === "fr" ? "Vu IRL" : "Seen IRL"}
              </span>
            )}
          </p>
          {profile.pro_mode && (profile.pro_title || profile.pro_company) && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "rgba(77,159,255,.15)", color: "#4d9fff" }}>
                💼 PRO
              </span>
              <span className="text-text-dim">
                {[profile.pro_title, profile.pro_company].filter(Boolean).join(" · ")}
              </span>
              {profile.pro_linkedin && (
                <a href={profile.pro_linkedin} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: "#4d9fff" }}>
                  in↗
                </a>
              )}
            </p>
          )}
          {profile.bio && <p className="mt-0.5 text-sm text-text-dim">{profile.bio}</p>}
        </div>

        {isMe ? (
          <>
            {/* 🎉↔💼 switch de version : social ou réseautage pro, en un tap */}
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface-2 p-1">
              {([
                { pro: false, label: locale === "fr" ? "🎉 Social" : "🎉 Social" },
                { pro: true, label: locale === "fr" ? "💼 Pro" : "💼 Pro" },
              ] as const).map((m) => (
                <button
                  key={String(m.pro)}
                  onClick={async () => {
                    if (proMode === m.pro) return;
                    setProMode(m.pro);
                    try {
                      await updateProfile(profile.id, { pro_mode: m.pro });
                      await refreshProfile();
                    } catch {
                      setProMode(!m.pro);
                    }
                  }}
                  className="rounded-xl py-2 text-sm font-bold transition-colors"
                  style={
                    proMode === m.pro
                      ? m.pro
                        ? { background: "rgba(77,159,255,.18)", color: "#4d9fff" }
                        : { background: "rgba(255,46,99,.15)", color: "var(--brand)" }
                      : { color: "var(--text-dim)" }
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setEditing(true)}
              className="mt-2 w-full rounded-xl border border-border py-2.5 text-sm font-semibold"
            >
              {t.profile.editProfile}
            </button>
          </>
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

      {isMe && crew.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-text-dim">
            👯 {locale === "fr" ? "Ton crew" : "Your crew"}
            <span className="ml-1.5 normal-case tracking-normal">
              · {locale === "fr" ? "détecté de tes sorties" : "detected from your nights"}
            </span>
          </p>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto">
            {crew.map((c) => (
              <Link
                key={c.user_id}
                href={`/u/${c.username}`}
                className="glass pressable flex shrink-0 items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3.5"
              >
                <span className="ring">
                  <Avatar
                    profile={{ username: c.username, display_name: c.display_name, avatar_url: c.avatar_url }}
                    size={34}
                  />
                </span>
                <span>
                  <span className="block text-sm font-bold leading-tight">
                    {c.display_name || c.username}
                  </span>
                  <span className="block text-[10px] text-text-dim">
                    {c.outings} {locale === "fr" ? "sorties" : "nights"}
                    {c.top_place ? ` · ${c.top_place}` : ""}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isMe && myDrops.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-text-dim">
            🎁 {locale === "fr" ? "Ma collection" : "My collection"}
          </p>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto">
            {myDrops.map((d, i) => (
              <div
                key={i}
                className="flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2"
                style={{ borderColor: "rgba(255,201,77,.35)", background: "rgba(255,201,77,.08)" }}
                title={d.place_name}
              >
                <span className="text-xl">{d.emoji}</span>
                <span className="text-xs font-bold">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
              maxLength={50}
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
                { v: "precise", emoji: "📡", label: locale === "fr" ? "Proximité" : "Proximity" },
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
                    ? "Tes amis (mutuels, en Proximité aussi) voient quand tu es à <150 m — jamais ta position exacte."
                    : "Mutual friends (also in Proximity) see when you're within 150 m — never your exact spot."
                  : locale === "fr"
                    ? "Tu apparais au lieu, sans GPS exact. Recommandé."
                    : "You show at the venue, no exact GPS. Recommended."}
            </p>

            {/* mode pro 💼 */}
            <div className="mb-4 rounded-2xl border border-border bg-surface-2 p-3">
              <button
                onClick={() => setProMode((v) => !v)}
                className="flex w-full items-center justify-between"
              >
                <span className="text-sm font-bold">💼 {locale === "fr" ? "Mode professionnel" : "Professional mode"}</span>
                <span
                  className="relative h-6 w-11 rounded-full transition-colors"
                  style={{ background: proMode ? "#4d9fff" : "var(--border)" }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                    style={{ transform: proMode ? "translateX(22px)" : "translateX(2px)" }}
                  />
                </span>
              </button>
              {proMode && (
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    value={proTitle}
                    onChange={(e) => setProTitle(e.target.value)}
                    maxLength={80}
                    placeholder={locale === "fr" ? "Titre (ex: Développeuse produit)" : "Title"}
                    className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                  <input
                    value={proCompany}
                    onChange={(e) => setProCompany(e.target.value)}
                    maxLength={80}
                    placeholder={locale === "fr" ? "Entreprise / projet" : "Company / project"}
                    className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                  <input
                    value={proLinkedin}
                    onChange={(e) => setProLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                    className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                </div>
              )}
            </div>

            {saveErr && (
              <p role="alert" className="mb-2 text-sm text-brand-2">
                {saveErr}
              </p>
            )}
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
