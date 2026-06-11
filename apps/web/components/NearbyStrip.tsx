"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  fetchFriendsNearby,
  getOrCreateConversation,
  upsertLivePosition,
  type NearbyFriend,
} from "@/lib/data";
import { Avatar } from "./Avatar";

const BEAT_MS = 45_000; // battement de position
const POLL_MS = 30_000; // rafraîchissement « qui est tout près »

/**
 * 📡 Mode Proximité — bandeau « tout près de toi ».
 * GPS haute précision aujourd'hui ; le natif UWB (NearbyInteraction)
 * remplacera la source de précision sans changer cette UI.
 */
export function NearbyStrip() {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const router = useRouter();
  const [friends, setFriends] = useState<NearbyFriend[]>([]);

  const active = profile?.location_sharing === "precise";

  // battement : publie ma position tant que le mode est actif
  useEffect(() => {
    if (!active || !profile) return;
    let alive = true;

    const beat = () => {
      if (!alive || typeof navigator === "undefined" || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!alive) return;
          upsertLivePosition(profile.id, pos.coords.latitude, pos.coords.longitude).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 20_000 }
      );
    };
    beat();
    const iv = setInterval(beat, BEAT_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [active, profile]);

  // sonde : qui est tout près ?
  useEffect(() => {
    if (!active) {
      setFriends([]);
      return;
    }
    let alive = true;
    const poll = () => fetchFriendsNearby().then((f) => alive && setFriends(f)).catch(() => {});
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [active]);

  if (!active || friends.length === 0) return null;

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-2 pb-2.5">
        <span className="live-dot" style={{ width: 6, height: 6 }} />
        <span className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-accent">
          📡 {fr ? "Tout près de toi" : "Right near you"}
        </span>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto">
        {friends.map((f) => (
          <div
            key={f.id}
            className="halo-card flex shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2.5"
            style={{ "--glow": "var(--glow-teal)", "--int": f.bucket === "ici" ? 0.9 : 0.45 } as React.CSSProperties}
          >
            <span className="ring">
              <Avatar profile={f} size={36} />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold">{f.display_name || f.username}</p>
              <p className="text-[11px] font-semibold text-accent">
                {f.bucket === "ici"
                  ? fr ? "est ici (< 30 m) 👀" : "is here (< 30 m) 👀"
                  : fr ? "tout près (< 150 m)" : "nearby (< 150 m)"}
              </p>
            </div>
            <button
              onClick={async () => {
                const cid = await getOrCreateConversation(f.id);
                router.push(`/messages/${cid}`);
              }}
              className="brand-gradient pressable ml-1 flex h-9 w-9 items-center justify-center rounded-full text-base text-white"
              aria-label={fr ? "Faire signe" : "Wave"}
            >
              👋
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
