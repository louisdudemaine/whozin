"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getCategory, MONTREAL, type NearbyPlace } from "@whosin/shared";
import { resolvedTheme } from "@/lib/theme";

/* la carte suit le thème : nuit néon ou petit matin pastel */
const STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
} as const;

function assignStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles);
}

function createPlaceMarker(place: NearbyPlace) {
  const cat = getCategory(place.category);
  const active = place.active_checkins > 0;
  const el = document.createElement("div");
  el.className = "wi-marker";

  const wrap = document.createElement("div");
  assignStyles(wrap, {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  });

  const icon = document.createElement("div");
  if (active) icon.className = "wi-pulse";
  icon.textContent = cat.emoji;
  assignStyles(icon, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "42px",
    height: "42px",
    borderRadius: "50%",
    background: cat.color,
    border: "2px solid #0a0a0f",
    fontSize: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,.5)",
  });
  wrap.append(icon);

  if (active) {
    const badge = document.createElement("div");
    badge.textContent = String(place.active_checkins);
    assignStyles(badge, {
      position: "absolute",
      top: "-6px",
      right: "-6px",
      minWidth: "20px",
      height: "20px",
      padding: "0 5px",
      borderRadius: "10px",
      background: "#fff",
      color: "#0a0a0f",
      fontSize: "11px",
      fontWeight: "800",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: `2px solid ${cat.color}`,
    });
    wrap.append(badge);
  }

  el.append(wrap);
  return el;
}

function createUserMarker() {
  const el = document.createElement("div");
  assignStyles(el, {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "#16d9c5",
    border: "3px solid #0a0a0f",
    boxShadow: "0 0 0 4px rgba(22,217,197,.3)",
  });
  return el;
}

export function MapView({
  places,
  userLoc,
  onMoveEnd,
  onSelect,
  flyTo,
}: {
  places: NearbyPlace[];
  userLoc: { lat: number; lng: number } | null;
  onMoveEnd: (center: { lat: number; lng: number }) => void;
  onSelect: (place: NearbyPlace) => void;
  flyTo: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onMoveEndRef = useRef(onMoveEnd);
  const onSelectRef = useRef(onSelect);
  onMoveEndRef.current = onMoveEnd;
  onSelectRef.current = onSelect;

  // init
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const start = userLoc ?? MONTREAL;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLES[resolvedTheme()],
      center: [start.lng, start.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => map.resize());
    map.on("moveend", () => {
      const c = map.getCenter();
      onMoveEndRef.current({ lat: c.lat, lng: c.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // bascule de thème pendant que la carte est ouverte (les marqueurs DOM survivent)
  useEffect(() => {
    const onTheme = () => mapRef.current?.setStyle(STYLES[resolvedTheme()]);
    window.addEventListener("wi:theme", onTheme);
    return () => window.removeEventListener("wi:theme", onTheme);
  }, []);

  // place markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const place of places) {
      const el = createPlaceMarker(place);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(place);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [places]);

  // user location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLoc) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLoc.lng, userLoc.lat]);
      return;
    }
    userMarkerRef.current = new maplibregl.Marker({ element: createUserMarker() })
      .setLngLat([userLoc.lng, userLoc.lat])
      .addTo(map);
  }, [userLoc]);

  // fly to
  useEffect(() => {
    if (mapRef.current && flyTo) {
      mapRef.current.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 14, speed: 1.4 });
    }
  }, [flyTo]);

  return <div ref={containerRef} className="h-full w-full" />;
}
