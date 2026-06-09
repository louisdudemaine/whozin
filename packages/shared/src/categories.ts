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

export const CATEGORIES: Record<CategoryKey, Category> = {
  bar: { key: "bar", emoji: "🍻", color: "#f59e0b", label: { fr: "Bar", en: "Bar" } },
  restaurant: { key: "restaurant", emoji: "🍽️", color: "#ef4444", label: { fr: "Restaurant", en: "Restaurant" } },
  cafe: { key: "cafe", emoji: "☕", color: "#a16207", label: { fr: "Café", en: "Café" } },
  club: { key: "club", emoji: "🪩", color: "#a855f7", label: { fr: "Club", en: "Club" } },
  festival: { key: "festival", emoji: "🎪", color: "#ec4899", label: { fr: "Festival", en: "Festival" } },
  concert: { key: "concert", emoji: "🎶", color: "#6366f1", label: { fr: "Concert", en: "Concert" } },
  sport: { key: "sport", emoji: "🏟️", color: "#22c55e", label: { fr: "Sport", en: "Sports" } },
  park: { key: "park", emoji: "🌳", color: "#16a34a", label: { fr: "Parc", en: "Park" } },
  event: { key: "event", emoji: "🎉", color: "#06b6d4", label: { fr: "Événement", en: "Event" } },
  other: { key: "other", emoji: "📍", color: "#64748b", label: { fr: "Autre", en: "Other" } },
};

export const CATEGORY_LIST: Category[] = Object.values(CATEGORIES);

export function getCategory(key: string | null | undefined): Category {
  if (key && key in CATEGORIES) return CATEGORIES[key as CategoryKey];
  return CATEGORIES.other;
}
