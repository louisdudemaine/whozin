/**
 * Catégories de lieux — partagées web + mobile.
 * Chaque catégorie a un emoji (marqueur carte), une couleur, et un libellé bilingue.
 */

export type CategoryKey =
  | "bar"
  | "restaurant"
  | "cafe"
  | "club"
  | "festival"
  | "concert"
  | "sport"
  | "park"
  | "event"
  | "other";

export interface Category {
  key: CategoryKey;
  emoji: string;
  color: string; // hex, utilisé pour les marqueurs et pastilles
  label: { fr: string; en: string };
}

/**
 * Palette « Afterglow » : chaque catégorie est un néon de devanture.
 * La couleur sert de halo (glow) — jamais en aplat plein sur de grandes surfaces.
 */
export const CATEGORIES: Record<CategoryKey, Category> = {
  bar: { key: "bar", emoji: "🍻", color: "#FF2E63", label: { fr: "Bar", en: "Bar" } },
  restaurant: { key: "restaurant", emoji: "🍽️", color: "#FF7849", label: { fr: "Restaurant", en: "Restaurant" } },
  cafe: { key: "cafe", emoji: "☕", color: "#16D9C5", label: { fr: "Café", en: "Café" } },
  club: { key: "club", emoji: "🪩", color: "#8B5CF6", label: { fr: "Club", en: "Club" } },
  festival: { key: "festival", emoji: "🎪", color: "#FFC94D", label: { fr: "Festival", en: "Festival" } },
  concert: { key: "concert", emoji: "🎶", color: "#E14FFF", label: { fr: "Concert", en: "Concert" } },
  sport: { key: "sport", emoji: "🏟️", color: "#4D9FFF", label: { fr: "Sport", en: "Sports" } },
  park: { key: "park", emoji: "🌳", color: "#3DDC84", label: { fr: "Parc", en: "Park" } },
  event: { key: "event", emoji: "🎉", color: "#B6FF3C", label: { fr: "Événement", en: "Event" } },
  other: { key: "other", emoji: "📍", color: "#8B8B9E", label: { fr: "Autre", en: "Other" } },
};

export const CATEGORY_LIST: Category[] = Object.values(CATEGORIES);

export function getCategory(key: string | null | undefined): Category {
  if (key && key in CATEGORIES) return CATEGORIES[key as CategoryKey];
  return CATEGORIES.other;
}
