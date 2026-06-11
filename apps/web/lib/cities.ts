"use client";

/** ✈️ Mode Voyage — explorer une autre ville. Toute l'app suit `wi.lastCenter`. */

export interface City {
  code: string;
  name: string;
  flag: string;
  lat: number;
  lng: number;
}

export const HOME_CITY: City = { code: "MTL", name: "Montréal", flag: "🇨🇦", lat: 45.5019, lng: -73.5674 };

export const CITIES: City[] = [
  HOME_CITY,
  { code: "QUE", name: "Québec", flag: "🇨🇦", lat: 46.8131, lng: -71.2075 },
  { code: "TOR", name: "Toronto", flag: "🇨🇦", lat: 43.6532, lng: -79.3832 },
  { code: "VAN", name: "Vancouver", flag: "🇨🇦", lat: 49.2827, lng: -123.1207 },
  { code: "NYC", name: "New York", flag: "🇺🇸", lat: 40.7128, lng: -74.006 },
  { code: "MIA", name: "Miami", flag: "🇺🇸", lat: 25.7617, lng: -80.1918 },
  { code: "PAR", name: "Paris", flag: "🇫🇷", lat: 48.8566, lng: 2.3522 },
  { code: "LDN", name: "Londres", flag: "🇬🇧", lat: 51.5074, lng: -0.1278 },
  { code: "BCN", name: "Barcelone", flag: "🇪🇸", lat: 41.3874, lng: 2.1686 },
  { code: "BER", name: "Berlin", flag: "🇩🇪", lat: 52.52, lng: 13.405 },
  { code: "TYO", name: "Tokyo", flag: "🇯🇵", lat: 35.6762, lng: 139.6503 },
  { code: "MEX", name: "Mexico", flag: "🇲🇽", lat: 19.4326, lng: -99.1332 },
];

const KEY = "wi.travelCity";

/** Ville en mode voyage, ou null si on est « à la maison ». */
export function getTravelCity(): City | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as City;
    return c.code === HOME_CITY.code ? null : c;
  } catch {
    return null;
  }
}

/** Active/désactive le mode voyage et aligne le centre global de l'app. */
export function setTravelCity(city: City | null): void {
  try {
    if (!city || city.code === HOME_CITY.code) {
      localStorage.removeItem(KEY);
      localStorage.setItem("wi.lastCenter", JSON.stringify({ lat: HOME_CITY.lat, lng: HOME_CITY.lng }));
    } else {
      localStorage.setItem(KEY, JSON.stringify(city));
      localStorage.setItem("wi.lastCenter", JSON.stringify({ lat: city.lat, lng: city.lng }));
    }
  } catch {
    /* ignore */
  }
}
