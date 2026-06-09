"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { updateLocationSharing } from "@/lib/data";

/** Bascule rapide de visibilité : approximative (visible) ↔ cachée (fantôme). */
export function LocationToggle({ compact = false }: { compact?: boolean }) {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  const hidden = profile.location_sharing === "hidden";

  async function toggle() {
    if (!profile) return;
    setBusy(true);
    try {
      await updateLocationSharing(profile.id, hidden ? "approx" : "hidden");
      await refreshProfile();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={hidden ? "Position cachée" : "Position approximative visible"}
      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold backdrop-blur-md disabled:opacity-60"
      style={{
        background: hidden ? "var(--surface)" : "rgba(22,217,197,0.12)",
        borderColor: hidden ? "var(--border)" : "var(--accent)",
        color: hidden ? "var(--text-dim)" : "var(--accent)",
      }}
    >
      <span>{hidden ? "👻" : "📍"}</span>
      {!compact && <span>{hidden ? "Caché" : "Approx."}</span>}
    </button>
  );
}
