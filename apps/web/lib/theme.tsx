"use client";

import { useEffect, useState } from "react";

/**
 * 🌗 Thème — auto (système) / clair / sombre.
 * Le gros du travail est en CSS (color-scheme + light-dark()) :
 * ici on ne fait que poser/enlever data-theme et persister le choix.
 */

export type ThemePref = "auto" | "light" | "dark";

const KEY = "wi.theme";

export function getThemePref(): ThemePref {
  if (typeof window === "undefined") return "auto";
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "auto") {
      localStorage.removeItem(KEY);
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem(KEY, pref);
      document.documentElement.dataset.theme = pref;
    }
    window.dispatchEvent(new CustomEvent("wi:theme"));
  } catch {
    /* stockage indisponible */
  }
}

/** Thème effectivement affiché (résout « auto » via le système). */
export function resolvedTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  const pref = getThemePref();
  if (pref !== "auto") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const CYCLE: ThemePref[] = ["auto", "light", "dark"];
const FACE: Record<ThemePref, { emoji: string; fr: string; en: string }> = {
  auto: { emoji: "🌗", fr: "Auto", en: "Auto" },
  light: { emoji: "☀️", fr: "Clair", en: "Light" },
  dark: { emoji: "🌙", fr: "Sombre", en: "Dark" },
};

/** Pilule compacte qui cycle auto → clair → sombre. */
export function ThemeToggle({ locale = "fr", compact = false }: { locale?: string; compact?: boolean }) {
  const [pref, setPref] = useState<ThemePref>("auto");

  useEffect(() => {
    setPref(getThemePref());
  }, []);

  function next() {
    const n = CYCLE[(CYCLE.indexOf(pref) + 1) % CYCLE.length];
    setPref(n);
    setThemePref(n);
  }

  const face = FACE[pref];
  return (
    <button
      onClick={next}
      className="glass pressable rounded-full px-2.5 py-1 text-xs font-bold text-text-dim"
      aria-label={locale === "fr" ? `Thème : ${face.fr}` : `Theme: ${face.en}`}
      title={locale === "fr" ? `Thème : ${face.fr}` : `Theme: ${face.en}`}
    >
      {face.emoji}
      {!compact && <span className="ml-1">{locale === "fr" ? face.fr : face.en}</span>}
    </button>
  );
}
