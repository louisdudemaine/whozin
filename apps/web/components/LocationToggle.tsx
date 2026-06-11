"use client";

import { useState } from "react";
import type { LocationSharing } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { updateLocationSharing } from "@/lib/data";

const CYCLE: LocationSharing[] = ["approx", "precise", "hidden"];

const LOOK: Record<LocationSharing, { emoji: string; label: string; color: string; bg: string }> = {
  approx: { emoji: "📍", label: "Approx.", color: "var(--accent)", bg: "rgba(22,217,197,0.12)" },
  precise: { emoji: "📡", label: "Proximité", color: "var(--brand-2)", bg: "rgba(255,120,73,0.14)" },
  hidden: { emoji: "👻", label: "Caché", color: "var(--text-dim)", bg: "var(--surface)" },
};

/** Bascule rapide 3 états : Approx (lieu) → Proximité (détectable tout près) → Caché. */
export function LocationToggle({ compact = false }: { compact?: boolean }) {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  const mode: LocationSharing = profile.location_sharing ?? "approx";
  const look = LOOK[mode];

  async function cycle() {
    if (!profile) return;
    setBusy(true);
    try {
      const next = CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
      await updateLocationSharing(profile.id, next);
      await refreshProfile();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={cycle}
      disabled={busy}
      aria-label={`Position : ${look.label}`}
      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold backdrop-blur-md disabled:opacity-60"
      style={{
        background: look.bg,
        borderColor: mode === "hidden" ? "var(--border)" : look.color,
        color: look.color,
      }}
    >
      <span>{look.emoji}</span>
      {!compact && <span>{look.label}</span>}
    </button>
  );
}
