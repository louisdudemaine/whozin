import { useColorScheme } from "react-native";

/**
 * 🌗 Afterglow mobile — mêmes tokens que le web (globals.css), deux heures de la ville :
 * sombre « Afterglow » (2h du matin) / clair « First Light » (7h du matin).
 * Suit le système (app.json: userInterfaceStyle "automatic").
 */

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textDim: string;
  brand: string;
  brand2: string;
  accent: string;
  violet: string;
  gold: string;
  glowRose: string;
  glowTeal: string;
}

export const DARK: Palette = {
  bg: "#07070d",
  surface: "#10101b",
  surface2: "#181826",
  border: "rgba(255,255,255,0.08)",
  text: "#f4f2f8",
  textDim: "#8b8b9e",
  brand: "#ff2e63",
  brand2: "#ff7849",
  accent: "#16d9c5",
  violet: "#8b5cf6",
  gold: "#ffc94d",
  glowRose: "rgba(255,46,99,0.45)",
  glowTeal: "rgba(22,217,197,0.4)",
};

export const LIGHT: Palette = {
  bg: "#f6f4fb",
  surface: "#ffffff",
  surface2: "#eeebf6",
  border: "rgba(26,20,38,0.10)",
  text: "#1a1426",
  textDim: "#6f6884",
  brand: "#f0214f",
  brand2: "#e8551c",
  accent: "#0b9d8e",
  violet: "#7c4dff",
  gold: "#a87a00",
  glowRose: "rgba(255,46,99,0.28)",
  glowTeal: "rgba(11,157,142,0.26)",
};

/** Palette du thème courant — à appeler en tête de chaque composant. */
export function useC(): Palette {
  return useColorScheme() === "light" ? LIGHT : DARK;
}

/** Statique (contexte hors-composant) — défaut nuit. */
export const C = DARK;
