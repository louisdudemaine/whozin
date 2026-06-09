/** Helpers géo — partagés web + mobile. */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371000;

/** Distance en mètres entre deux points (Haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance lisible (« 250 m », « 1,4 km »). */
export function formatDistance(meters: number, locale: "fr" | "en" = "fr"): string {
  if (meters < 1000) {
    return `${Math.round(meters / 10) * 10} m`;
  }
  const km = meters / 1000;
  const value = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  const sep = locale === "fr" ? value.replace(".", ",") : value;
  return `${sep} km`;
}

/**
 * Floute une coordonnée pour la confidentialité (visibilité non précise).
 * Arrondit à ~jitter mètres pour ne jamais exposer la position exacte.
 */
export function fuzzCoord(point: LatLng, jitterMeters = 150): LatLng {
  // 1 degré de latitude ≈ 111_320 m
  const dLat = jitterMeters / 111320;
  const dLng = jitterMeters / (111320 * Math.cos(toRad(point.lat)) || 1);
  // décalage déterministe léger basé sur la coordonnée (stable entre rendus)
  const seed = Math.sin(point.lat * 1000 + point.lng * 1000);
  const seed2 = Math.cos(point.lat * 1000 - point.lng * 1000);
  return {
    lat: point.lat + dLat * seed,
    lng: point.lng + dLng * seed2,
  };
}

export const MONTREAL: LatLng = { lat: 45.5019, lng: -73.5674 };
