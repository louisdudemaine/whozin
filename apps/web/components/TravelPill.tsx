"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/locale";
import { CITIES, HOME_CITY, getTravelCity, setTravelCity, type City } from "@/lib/cities";

/** ✈️ Mode Voyage — la pilule ville du header ouvre le sélecteur « discover abroad ». */
export function TravelPill() {
  const { locale } = useT();
  const fr = locale === "fr";
  const [city, setCity] = useState<City | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setCity(getTravelCity());
  }, []);

  function pick(c: City) {
    setTravelCity(c.code === HOME_CITY.code ? null : c);
    // tout le monde relit wi.lastCenter au montage -> rechargement propre
    window.location.reload();
  }

  const traveling = !!city;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
        style={traveling ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}
        aria-label="Changer de ville"
      >
        {traveling ? (
          <>✈️ {city!.code}</>
        ) : (
          <>
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            {HOME_CITY.code}
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 animate-fade" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[480px] rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] animate-slide-up">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-text/20" />
            <h2 className="font-display text-lg font-bold">
              ✈️ {fr ? "Découvrir une autre ville" : "Discover another city"}
            </h2>
            <p className="mt-0.5 text-xs text-text-dim">
              {fr
                ? "Vois ce qui bouge là-bas — avant même d'y être."
                : "See what's buzzing there — before you even land."}
            </p>
            <div className="mt-4 grid max-h-[50dvh] grid-cols-2 gap-2 overflow-y-auto">
              {CITIES.map((c) => {
                const current = (city?.code ?? HOME_CITY.code) === c.code;
                return (
                  <button
                    key={c.code}
                    onClick={() => pick(c)}
                    className="pressable flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left"
                    style={{
                      borderColor: current ? "var(--brand)" : "var(--border)",
                      background: current ? "rgba(255,46,99,.1)" : "var(--surface-2)",
                    }}
                  >
                    <span className="text-xl">{c.flag}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{c.name}</span>
                      <span className="text-[10px] text-text-dim">{c.code}</span>
                    </span>
                    {c.code === HOME_CITY.code && (
                      <span className="ml-auto text-[10px] font-bold text-accent">
                        {fr ? "🏠" : "🏠"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {traveling && (
              <button
                onClick={() => pick(HOME_CITY)}
                className="brand-gradient pressable mt-4 w-full rounded-full py-3 font-display text-sm font-bold text-white"
              >
                🏠 {fr ? "Revenir à Montréal" : "Back to Montréal"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
