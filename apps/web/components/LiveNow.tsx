"use client";

import type { CheckIn, NearbyPlace, Place, Profile } from "@whosin/shared";
import { getCategory } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { Avatar } from "./Avatar";

interface LivePlace {
  place: Place;
  people: Profile[];
  messages: string[];
  /** 0→1 : part de vie restante du check-in le plus frais (mèche) */
  life: number;
}

function hexGlow(hex: string, a = 0.45): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(255,46,99,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * « ÇA BOUGE MAINTENANT » — les enseignes de la rue.
 * La lumière est la donnée : plus un lieu est plein, plus sa carte irradie.
 */
export function LiveNow({
  checkIns,
  onSelectPlace,
}: {
  checkIns: CheckIn[];
  onSelectPlace: (place: NearbyPlace) => void;
}) {
  const { locale } = useT();
  if (checkIns.length === 0) return null;

  const now = Date.now();
  const byPlace = new Map<string, LivePlace>();
  for (const c of checkIns) {
    if (!c.place) continue;
    const entry =
      byPlace.get(c.place_id) ?? { place: c.place, people: [], messages: [], life: 0 };
    if (c.author) entry.people.push(c.author);
    if (c.message) entry.messages.push(c.message);
    const life = Math.max(
      0,
      Math.min(1, (new Date(c.expires_at).getTime() - now) / (3 * 3600 * 1000))
    );
    entry.life = Math.max(entry.life, life);
    byPlace.set(c.place_id, entry);
  }
  const livePlaces = [...byPlace.values()].sort((a, b) => b.people.length - a.people.length);
  const maxPeople = Math.max(...livePlaces.map((p) => p.people.length), 1);

  return (
    <div className="pb-1">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <span className="live-dot" />
        <span className="font-display text-[13px] font-bold uppercase tracking-[0.14em]">
          {locale === "fr" ? "Ça bouge maintenant" : "Happening now"}
        </span>
      </div>

      <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-7">
        {livePlaces.map(({ place, people, messages, life }, i) => {
          const cat = getCategory(place.category);
          const heat = people.length / maxPeople;
          return (
            <button
              key={place.id}
              onClick={() =>
                onSelectPlace({ ...place, distance_m: 0, active_checkins: people.length })
              }
              className="halo-card halo-breathe pressable animate-glow-enter w-64 shrink-0 snap-center overflow-hidden rounded-3xl text-left"
              style={
                {
                  "--glow": hexGlow(cat.color, 0.28 + 0.3 * heat),
                  "--int": heat,
                  "--i": Math.min(i, 6),
                  animationDelay: `calc(${Math.min(i, 6)} * 60ms), ${-i * 0.9}s`,
                } as React.CSSProperties
              }
            >
              {/* scène du lieu : néon de catégorie */}
              <div
                className="relative flex h-28 items-center justify-center"
                style={{
                  background: `radial-gradient(80% 90% at 50% 110%, ${hexGlow(cat.color, 0.38)}, transparent 70%)`,
                }}
              >
                <span className="text-5xl" style={{ filter: `drop-shadow(0 0 18px ${hexGlow(cat.color, 0.8)})` }}>
                  {cat.emoji}
                </span>
                <span className="glass absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold">
                  <span className="live-dot" style={{ width: 6, height: 6 }} />
                  LIVE
                </span>
                <span
                  className="absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{ background: hexGlow(cat.color, 0.2), color: cat.color }}
                >
                  {cat.label[locale]}
                </span>
              </div>

              <div className="px-4 pb-4 pt-1">
                <p className="font-display truncate text-base font-bold leading-snug">{place.name}</p>

                <div className="mt-3 flex items-center justify-between">
                  <div className="stack">
                    {people.slice(0, 4).map((p, j) => (
                      <span key={p.id} className="ring" style={{ zIndex: 4 - j }}>
                        <Avatar profile={p} size={30} />
                      </span>
                    ))}
                  </div>
                  <span className="font-display text-lg font-extrabold" style={{ color: cat.color }}>
                    {people.length}{" "}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-dim">
                      {locale === "fr" ? "ici" : "here"}
                    </span>
                  </span>
                </div>

                {/* jauge de chaleur : l'affluence se lit comme un égaliseur */}
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-text/10">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(12, heat * 100)}%`,
                      background: "linear-gradient(90deg, var(--accent), var(--brand-2), var(--brand))",
                      boxShadow: `0 0 8px ${hexGlow(cat.color, 0.6)}`,
                    }}
                  />
                </div>

                {/* mèche de vie du check-in le plus frais */}
                <div className="mt-1.5">
                  <div className="fuse" style={{ "--life": life } as React.CSSProperties} />
                </div>

                {messages[0] && (
                  <p className="mt-2.5 truncate text-xs italic text-text-dim">“{messages[0]}”</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
