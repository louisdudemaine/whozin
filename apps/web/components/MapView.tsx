"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getCategory, MONTREAL, type NearbyPlace } from "@whosin/shared";

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

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
      style: STYLE_URL,
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

  // place markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const place of places) {
      const cat = getCategory(place.category);
      const el = document.createElement("div");
      el.className = "wi-marker";
      const active = place.active_checkins > 0;
      el.innerHTML = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center">
          <div class="${active ? "wi-pulse" : ""}" style="
            display:flex;align-items:center;justify-content:center;
            width:42px;height:42px;border-radius:50%;
            background:${cat.color};border:2px solid #0a0a0f;
            font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,.5)">
            ${cat.emoji}
          </div>
          ${
            active
              ? `<div style="position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;
                  padding:0 5px;border-radius:10px;background:#fff;color:#0a0a0f;
                  font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;
                  border:2px solid ${cat.color}">${place.active_checkins}</div>`
              : ""
          }
        </div>`;
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
    const el = document.createElement("div");
    el.innerHTML = `<div style="width:18px;height:18px;border-radius:50%;background:#16d9c5;
      border:3px solid #0a0a0f;box-shadow:0 0 0 4px rgba(22,217,197,.3)"></div>`;
    userMarkerRef.current = new maplibregl.Marker({ element: el })
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
