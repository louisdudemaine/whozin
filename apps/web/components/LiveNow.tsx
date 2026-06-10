"use client";

import type { CheckIn, NearbyPlace, Place, Profile } from "@whosin/shared";
import { getCategory } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { Avatar } from "./Avatar";

interface LivePlace {
  place: Place;
  people: Profile[];
  messages: string[];
}

/**
 * Identité Whozin : le LIEU est la vedette (pas des cercles de personnes à la IG).
 * Cartes horizontales par lieu actif, avatars empilés de qui est là.
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

  // regroupe les check-ins actifs par lieu
  const byPlace = new Map<string, LivePlace>();
  for (const c of checkIns) {
    if (!c.place) continue;
    const entry = byPlace.get(c.place_id) ?? { place: c.place, people: [], messages: [] };
    if (c.author) entry.people.push(c.author);
    if (c.message) entry.messages.push(c.message);
    byPlace.set(c.place_id, entry);
  }
  const livePlaces = [...byPlace.values()].sort((a, b) => b.people.length - a.people.length);

  return (
    <div className="border-b border-border pb-3">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
        </span>
        <span className="text-sm font-black uppercase tracking-wide">
          {locale === "fr" ? "Ça bouge maintenant" : "Happening now"}
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4">
        {livePlaces.map(({ place, people, messages }) => {
          const cat = getCategory(place.category);
          return (
            <button
              key={place.id}
              onClick={() =>
                onSelectPlace({ ...place, distance_m: 0, active_checkins: people.length })
              }
              className="relative w-52 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface text-left"
            >
              {/* bande de couleur catégorie */}
              <div
                className="flex items-center gap-2 px-3 py-2"
                style={{ background: `linear-gradient(135deg, ${cat.color}33, transparent)` }}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                  style={{ background: cat.color + "44" }}
                >
                  {cat.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{place.name}</p>
                  <p className="text-[11px]" style={{ color: cat.color }}>
                    {cat.label[locale]}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                {/* avatars empilés */}
                <div className="flex items-center">
                  {people.slice(0, 4).map((p, i) => (
                    <span
                      key={p.id}
                      className="rounded-full ring-2 ring-surface"
                      style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 4 - i }}
                    >
                      <Avatar profile={p} size={28} />
                    </span>
                  ))}
                </div>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-accent">
                  {people.length} {locale === "fr" ? "ici" : "here"}
                </span>
              </div>

              {messages[0] && (
                <p className="truncate border-t border-border px-3 py-2 text-xs italic text-text-dim">
                  “{messages[0]}”
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
