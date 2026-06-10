"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCategory, MONTREAL, type NearbyPlace, type UserStories } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  fetchNearby,
  fetchStories,
  markStoryViewed,
  publishStory,
  storyViewerCount,
  uploadMedia,
} from "@/lib/data";
import { Avatar } from "./Avatar";
import { SafetyMenu } from "./SafetyMenu";

const STORY_MS = 5000;

/* ───────────────────────── Barre d'avatars ───────────────────────── */

export function StoriesBar() {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const [groups, setGroups] = useState<UserStories[]>([]);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    if (!profile) return;
    fetchStories(profile.id).then(setGroups).catch(() => {});
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile) return null;
  const mine = groups.find((g) => g.author.id === profile.id);

  return (
    <div className="border-b border-border">
      <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-3.5">
        {/* Ta story */}
        <button onClick={() => (mine ? setViewerIdx(groups.indexOf(mine)) : setComposing(true))} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <span className={mine && !mine.allViewed ? "ring" : "ring ring--static"} style={!mine ? { background: "var(--surface-2)" } : undefined}>
            <span className="relative block rounded-full">
              <Avatar profile={profile} size={56} />
              <span
                className="brand-gradient absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background text-xs font-bold text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setComposing(true);
                }}
              >
                +
              </span>
            </span>
          </span>
          <span className="max-w-[64px] truncate text-[11px] text-text-dim">
            {fr ? "Ta story" : "Your story"}
          </span>
        </button>

        {groups
          .filter((g) => g.author.id !== profile.id)
          .map((g) => {
            const idx = groups.indexOf(g);
            return (
              <button key={g.author.id} onClick={() => setViewerIdx(idx)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <span className={g.allViewed ? "ring ring--static" : "ring"} style={g.allViewed ? { background: "rgba(255,255,255,.14)" } : undefined}>
                  <Avatar profile={g.author} size={56} />
                </span>
                <span className="max-w-[64px] truncate text-[11px]" style={{ color: g.allViewed ? "var(--text-dim)" : "var(--text)" }}>
                  {g.author.display_name || g.author.username}
                </span>
              </button>
            );
          })}
      </div>

      {viewerIdx !== null && groups[viewerIdx] && (
        <StoryViewer
          groups={groups}
          startGroup={viewerIdx}
          onClose={() => {
            setViewerIdx(null);
            load();
          }}
        />
      )}
      {composing && (
        <StoryComposer
          onClose={() => setComposing(false)}
          onPublished={() => {
            setComposing(false);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Visionneuse plein écran ───────────────────────── */

function StoryViewer({
  groups,
  startGroup,
  onClose,
}: {
  groups: UserStories[];
  startGroup: number;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { locale } = useT();
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const group = groups[gi];
  const story = group?.stories[si];

  const next = useCallback(() => {
    if (!group) return onClose();
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(0);
    } else onClose();
  }, [gi, si, group, groups.length, onClose]);

  const prev = useCallback(() => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      const g = gi - 1;
      setGi(g);
      setSi(groups[g].stories.length - 1);
    }
  }, [gi, si, groups]);

  // marquer vu + compteur de vues (sur les miennes)
  useEffect(() => {
    if (!story || !profile) return;
    if (story.user_id !== profile.id) markStoryViewed(story.id, profile.id).catch(() => {});
    else storyViewerCount(story.id).then(setViewers).catch(() => {});
    return () => setViewers(null);
  }, [story, profile]);

  // auto-avance
  useEffect(() => {
    if (paused || !story) return;
    timerRef.current = setTimeout(next, STORY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [story, paused, next]);

  if (!group || !story) return null;
  const cat = story.place ? getCategory(story.place.category) : null;
  const fr = locale === "fr";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-background">
      {/* média */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={story.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-0 top-0 h-28" style={{ background: "linear-gradient(rgba(7,7,13,.8), transparent)" }} />
      <div className="absolute inset-x-0 bottom-0 h-36" style={{ background: "var(--scrim)" }} />

      {/* barres de progression */}
      <div className="relative z-10 flex gap-1 px-3 pt-[max(12px,env(safe-area-inset-top))]">
        {group.stories.map((s, i) => (
          <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white"
              style={{
                width: i < si ? "100%" : i > si ? "0%" : undefined,
                animation: i === si && !paused ? `story-progress ${STORY_MS}ms linear forwards` : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* header */}
      <div className="relative z-10 flex items-center gap-2.5 px-3 pt-2.5">
        <span className="ring ring--static">
          <Avatar profile={group.author} size={34} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-bold">{group.author.display_name || group.author.username}</p>
          {cat && story.place && (
            <p className="truncate text-xs" style={{ color: cat.color }}>
              {cat.emoji} {story.place.name}
            </p>
          )}
        </div>
        {profile && story.user_id !== profile.id && (
          <SafetyMenu targetType="story" targetId={story.id} targetUserId={story.user_id} />
        )}
        <button onClick={onClose} aria-label="Fermer" className="px-2 text-2xl text-white">
          ✕
        </button>
      </div>

      {/* zones tap prev/next + pause au maintien */}
      <div className="absolute inset-0 z-[5] flex">
        <button
          className="w-1/3"
          onClick={prev}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          aria-label="Précédent"
        />
        <button
          className="w-2/3"
          onClick={next}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          aria-label="Suivant"
        />
      </div>

      {/* pied : légende + vu par */}
      <div className="relative z-10 mt-auto px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
        {story.caption && <p className="text-[15px] font-semibold">{story.caption}</p>}
        {viewers !== null && (
          <p className="mt-1 text-xs text-text-dim">
            👁 {fr ? "Vu par" : "Seen by"} {viewers}
          </p>
        )}
      </div>

      <style>{`@keyframes story-progress { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
}

/* ───────────────────────── Composeur ───────────────────────── */

function StoryComposer({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fileRef.current?.click();
    const center = (() => {
      try {
        const raw = localStorage.getItem("wi.lastCenter");
        return raw ? (JSON.parse(raw) as { lat: number; lng: number }) : MONTREAL;
      } catch {
        return MONTREAL;
      }
    })();
    fetchNearby(center.lat, center.lng).then(setPlaces).catch(() => {});
  }, []);

  async function publish() {
    if (!profile || !file) return;
    setBusy(true);
    try {
      const url = await uploadMedia(file, profile.id);
      await publishStory(profile.id, url, caption.trim() || null, placeId);
      onPublished();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-background">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          setPreview(f ? URL.createObjectURL(f) : null);
          if (!f) onClose();
        }}
      />
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-56" style={{ background: "var(--scrim)" }} />
          <button onClick={onClose} className="relative z-10 self-end px-4 pt-[max(14px,env(safe-area-inset-top))] text-2xl text-white">
            ✕
          </button>
          <div className="relative z-10 mt-auto flex flex-col gap-3 p-4 pb-[max(20px,env(safe-area-inset-bottom))]">
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {places.slice(0, 10).map((p) => {
                const cat = getCategory(p.category);
                const on = placeId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlaceId(on ? null : p.id)}
                    className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold"
                    style={{
                      background: on ? cat.color : "rgba(255,255,255,.12)",
                      color: on ? "#07070d" : "var(--text)",
                    }}
                  >
                    {cat.emoji} {p.name}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={200}
                placeholder={fr ? "Une légende…" : "A caption…"}
                className="glass flex-1 rounded-full px-4 py-3 text-[15px] outline-none"
              />
              <button
                onClick={publish}
                disabled={busy}
                className="glow-cta brand-gradient pressable shrink-0 rounded-full px-5 py-3 font-display text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "…" : fr ? "Publier" : "Share"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <button onClick={onClose} className="m-auto text-sm text-text-dim">
          {fr ? "Annuler" : "Cancel"}
        </button>
      )}
    </div>
  );
}
