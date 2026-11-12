"use client";

import { useState } from "react";
import type { LocationSharing } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { updateLocationSharing } from "@/lib/data";
import { useT } from "@/lib/locale";

const MODES: LocationSharing[] = ["approx", "precise", "hidden"];

const LOOK: Record<LocationSharing, { emoji: string; label: string; color: string; bg: string }> = {
  approx: { emoji: "📍", label: "Approx.", color: "var(--accent)", bg: "rgba(22,217,197,0.12)" },
  precise: { emoji: "📡", label: "Proximité", color: "var(--brand-2)", bg: "rgba(255,120,73,0.14)" },
  hidden: { emoji: "👻", label: "Caché", color: "var(--text-dim)", bg: "var(--surface)" },
};

/** Choix direct du mode de position : Approx (lieu), Proximité (détectable tout près) ou Caché. */
export function LocationToggle({ compact = false }: { compact?: boolean }) {
  const { profile, refreshProfile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile) return null;

  const mode: LocationSharing = profile.location_sharing ?? "approx";
  const look = LOOK[mode];

  async function choose(next: LocationSharing) {
    if (!profile) return;
    if (next === mode) {
      setOpen(false);
      return;
    }
    // passer en Caché termine les check-ins en cours (déclencheur en base) : on le dit avant
    if (
      next === "hidden" &&
      !window.confirm(
        fr ? "Passer en Caché met fin à tes check-ins en cours. Continuer ?" : "Going Hidden ends your current check-ins. Continue?"
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await updateLocationSharing(profile.id, next);
      await refreshProfile();
      setOpen(false);
    } catch {
      setError(fr ? "Mode non changé, réessaie." : "Mode not changed, try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Position : ${look.label}`}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold backdrop-blur-md"
        style={{
          background: look.bg,
          borderColor: mode === "hidden" ? "var(--border)" : look.color,
          color: look.color,
        }}
      >
        <span>{look.emoji}</span>
        {!compact && <span>{look.label}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 flex w-max flex-col gap-1 rounded-2xl border border-border bg-surface/90 p-1.5 backdrop-blur-md">
          {MODES.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={mode === v}
              disabled={busy}
              onClick={() => choose(v)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-60"
              style={{ color: LOOK[v].color, background: mode === v ? LOOK[v].bg : "transparent" }}
            >
              <span>{LOOK[v].emoji}</span>
              <span>{LOOK[v].label}</span>
            </button>
          ))}
          {error && (
            <p role="alert" className="max-w-44 px-3 pb-1 text-xs text-brand-2">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
