"use client";

import { getCategory, type CheckIn, type NearbyPlace } from "@whosin/shared";
import { Avatar } from "./Avatar";

export function LiveStories({
  checkIns,
  onSelectPlace,
}: {
  checkIns: CheckIn[];
  onSelectPlace: (place: NearbyPlace) => void;
}) {
  if (checkIns.length === 0) return null;

  // compte de personnes actives par lieu
  const countByPlace = new Map<string, number>();
  for (const c of checkIns) {
    countByPlace.set(c.place_id, (countByPlace.get(c.place_id) ?? 0) + 1);
  }

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-1 px-3 pt-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
        <span className="text-xs font-bold uppercase tracking-wide text-brand">En direct</span>
      </div>
      <div className="flex gap-3 overflow-x-auto px-3 py-3">
        {checkIns.map((c) => {
          const cat = c.place ? getCategory(c.place.category) : getCategory("other");
          return (
            <button
              key={c.id}
              onClick={() => {
                if (!c.place) return;
                onSelectPlace({
                  ...c.place,
                  distance_m: 0,
                  active_checkins: countByPlace.get(c.place_id) ?? 1,
                });
              }}
              className="flex w-16 shrink-0 flex-col items-center gap-1"
            >
              <span
                className="relative rounded-full p-[2.5px]"
                style={{
                  background: `linear-gradient(135deg, ${cat.color}, var(--brand-2))`,
                }}
              >
                <span className="block rounded-full border-2 border-background">
                  <Avatar profile={c.author} size={56} />
                </span>
                <span
                  className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background text-[10px]"
                  style={{ background: cat.color }}
                >
                  {cat.emoji}
                </span>
              </span>
              <span className="max-w-[64px] truncate text-[11px] text-text">
                {c.author?.display_name || c.author?.username}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
