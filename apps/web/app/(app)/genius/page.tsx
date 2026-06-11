"use client";

import { useState } from "react";
import Link from "next/link";
import { getCategory, MONTREAL } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";

interface Stop {
  order: number;
  time: string;
  place_id: string;
  name: string;
  category: string;
  active: number;
  why: string;
}

const VIBES = [
  { key: "manger", emoji: "🌮", fr: "Manger", en: "Eat" },
  { key: "danser", emoji: "🪩", fr: "Danser", en: "Dance" },
  { key: "chill", emoji: "🍹", fr: "Chill", en: "Chill" },
  { key: "festif", emoji: "🎪", fr: "Festif", en: "Party" },
  { key: "sportif", emoji: "🏟️", fr: "Sportif", en: "Sports" },
];

/** 🧞 Whozin Genius — génère ta soirée parfaite. */
export default function GeniusPage() {
  const { locale } = useT();
  const fr = locale === "fr";
  const [vibes, setVibes] = useState<Set<string>>(new Set(["manger", "danser"]));
  const [people, setPeople] = useState(2);
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [narration, setNarration] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleVibe(k: string) {
    setVibes((v) => {
      const n = new Set(v);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setStops(null);
    try {
      const center = (() => {
        try {
          const raw = localStorage.getItem("wi.lastCenter");
          return raw ? (JSON.parse(raw) as { lat: number; lng: number }) : MONTREAL;
        } catch {
          return MONTREAL;
        }
      })();
      const { data } = await getSupabase().auth.getSession();
      const res = await fetch("/api/genius", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({ ...center, vibes: [...vibes], people, locale }),
      });
      if (!res.ok) throw new Error();
      const out = await res.json();
      setStops(out.stops);
      setNarration(out.narration);
    } catch {
      setError(fr ? "Le génie a eu un blanc — réessaie." : "The genie blanked — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-[rgba(7,7,13,0.72)] px-4 py-3 backdrop-blur-xl pt-[max(12px,env(safe-area-inset-top))]">
        <Link href="/feed" className="text-text-dim">←</Link>
        <h1 className="font-display text-xl font-extrabold">
          🧞 Whozin <span className="text-gradient neon-text">Genius</span>
        </h1>
      </header>

      <div className="p-4">
        <p className="font-display text-2xl font-extrabold leading-tight">
          {fr ? "Ta soirée parfaite," : "Your perfect night,"}
          <br />
          <span className="text-gradient">{fr ? "générée en 3 secondes." : "generated in 3 seconds."}</span>
        </p>
        <p className="mt-1.5 text-sm text-text-dim">
          {fr
            ? "Selon tes goûts, ce qui bouge en ce moment, et ta vibe du soir."
            : "Based on your taste, what's buzzing right now, and tonight's vibe."}
        </p>

        {/* vibes */}
        <div className="mt-5 flex flex-wrap gap-2">
          {VIBES.map((v) => {
            const on = vibes.has(v.key);
            return (
              <button
                key={v.key}
                onClick={() => toggleVibe(v.key)}
                className="rounded-full border px-4 py-2.5 text-sm font-bold"
                style={{
                  borderColor: on ? "var(--brand)" : "var(--border)",
                  background: on ? "rgba(255,46,99,.14)" : "var(--surface)",
                  color: on ? "var(--brand)" : "var(--text-dim)",
                }}
              >
                {v.emoji} {fr ? v.fr : v.en}
              </button>
            );
          })}
        </div>

        {/* taille du groupe */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-text-dim">{fr ? "On est" : "We are"}</span>
          {[1, 2, 4, 6].map((n) => (
            <button
              key={n}
              onClick={() => setPeople(n)}
              className="h-10 w-10 rounded-full border text-sm font-bold"
              style={{
                borderColor: people === n ? "var(--accent)" : "var(--border)",
                color: people === n ? "var(--accent)" : "var(--text-dim)",
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          onClick={generate}
          disabled={busy}
          className="glow-cta brand-gradient pressable mt-6 w-full rounded-full py-4 font-display text-base font-bold text-white disabled:opacity-60"
        >
          {busy ? (fr ? "Le génie réfléchit… 🧞" : "The genie is thinking… 🧞") : fr ? "Génère ma soirée ✨" : "Generate my night ✨"}
        </button>

        {error && <p className="mt-3 text-center text-sm text-brand-2">{error}</p>}

        {/* itinéraire */}
        {stops && (
          <div className="mt-6">
            {narration && (
              <p className="glass mb-4 rounded-2xl p-4 text-[15px] leading-snug animate-glow-enter">
                🧞 {narration}
              </p>
            )}
            <div className="relative flex flex-col gap-4 pl-7">
              <span className="absolute bottom-6 left-2.5 top-2 w-px" style={{ background: "linear-gradient(180deg,#16d9c5,#ff7849,#ff2e63)" }} />
              {stops.map((s, i) => {
                const cat = getCategory(s.category);
                return (
                  <div
                    key={s.place_id}
                    className="halo-card animate-glow-enter relative rounded-3xl p-4"
                    style={{ "--glow": cat.color + "55", "--int": 0.4 + s.active * 0.1, "--i": i } as React.CSSProperties}
                  >
                    <span
                      className="absolute -left-7 top-5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-background"
                      style={{ background: cat.color }}
                    >
                      {s.order}
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: cat.color }}>
                      {s.time} · {cat.label[locale]}
                    </p>
                    <p className="font-display mt-0.5 text-lg font-bold">
                      {cat.emoji} {s.name}
                    </p>
                    <p className="mt-1 text-sm text-text-dim">{s.why}</p>
                    {s.active > 0 && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-accent">
                        <span className="live-dot" style={{ width: 6, height: 6 }} /> {s.active}{" "}
                        {fr ? "sur place maintenant" : "there right now"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={generate}
              className="mt-4 w-full rounded-full border border-border py-3 text-sm font-semibold text-text-dim"
            >
              🎲 {fr ? "Autre plan" : "Another plan"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
