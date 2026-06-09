"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { MONTREAL, type NearbyPlace } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";
import { fetchNearby } from "@/lib/data";
import { CheckInSheet } from "@/components/CheckInSheet";
import { LocationToggle } from "@/components/LocationToggle";

const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-text-dim">…</div>
  ),
});

export default function MapPage() {
  const { t } = useT();
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [center, setCenter] = useState(MONTREAL);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<NearbyPlace | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (lat: number, lng: number) => {
    try {
      const data = await fetchNearby(lat, lng);
      setPlaces(data);
    } catch {
      /* ignore */
    }
  }, []);

  // initial load + geoloc
  useEffect(() => {
    load(MONTREAL.lat, MONTREAL.lng);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLoc(loc);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [load]);

  const onMoveEnd = useCallback(
    (c: { lat: number; lng: number }) => {
      setCenter(c);
      try {
        localStorage.setItem("wi.lastCenter", JSON.stringify(c));
      } catch {
        /* ignore */
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => load(c.lat, c.lng), 350);
    },
    [load]
  );

  // realtime : un check-in ailleurs => recharge les compteurs du centre courant
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel("map-checkins")
      .on("postgres_changes", { event: "*", schema: "public", table: "check_ins" }, () => {
        load(center.lat, center.lng);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [center.lat, center.lng, load]);

  const totalActive = places.reduce((s, p) => s + p.active_checkins, 0);

  return (
    <div className="relative h-[100dvh]">
      <MapView
        places={places}
        userLoc={userLoc}
        onMoveEnd={onMoveEnd}
        onSelect={setSelected}
        flyTo={flyTo}
      />

      {/* header flottant */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-4 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/90 px-4 py-2 backdrop-blur-md">
          <span className="text-lg font-black">
            Whoz<span className="text-gradient">in</span>
          </span>
          <span className="h-4 w-px bg-border" />
          <span className="text-xs text-text-dim">
            <b className="text-accent">{totalActive}</b> {t.map.activeNow} ·{" "}
            <b className="text-text">{places.length}</b> {t.map.activePlaces}
          </span>
        </div>
        <LocationToggle />
      </div>

      {/* recentrer */}
      <button
        onClick={() => {
          if (userLoc) setFlyTo({ ...userLoc });
          else setFlyTo({ ...MONTREAL });
          setTimeout(() => setFlyTo(null), 100);
        }}
        className="absolute bottom-[150px] right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface/90 text-lg backdrop-blur-md"
        aria-label={t.map.recenter}
      >
        🎯
      </button>

      {selected && (
        <CheckInSheet
          place={selected}
          onClose={() => setSelected(null)}
          onChanged={() => load(center.lat, center.lng)}
        />
      )}
    </div>
  );
}
