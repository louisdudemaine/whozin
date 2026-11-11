"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NightRecap } from "@whosin/shared";
import { getCategory } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { fetchNightRecap } from "@/lib/data";
import { getSupabase } from "@/lib/supabase";
import { renderShareCard, shareImage } from "@/lib/sharecard";
import { Avatar } from "@/components/Avatar";

/** 🌅 Recap du lendemain — ta nuit, racontée le matin. */
export default function RecapPage() {
  const { locale } = useT();
  const fr = locale === "fr";
  const [recap, setRecap] = useState<NightRecap | null>(null);
  const [narration, setNarration] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetchNightRecap();
      setRecap(r);
      setLoading(false);
      if (!r) return;
      try {
        const { data: s } = await getSupabase().auth.getSession();
        const res = await fetch("/api/recap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${s.session?.access_token}`,
          },
          body: JSON.stringify({
            stops: r.stops.map((s) => ({ name: s.name, category: s.category })),
            crossedNames: r.crossed.map((c) => c.display_name || c.username),
            likes: r.likes,
            matches: r.matches,
            locale,
          }),
        });
        if (res.ok) setNarration((await res.json()).narration ?? null);
      } catch {
        /* narration optionnelle */
      }
    })();
  }, [locale]);

  async function share() {
    if (!recap) return;
    setSharing(true);
    try {
      const blob = await renderShareCard({
        title: fr ? "Ma soirée d'hier" : "Last night",
        subtitle: narration ?? undefined,
        emoji: "🌅",
        accent: "#ffc94d",
        lines: [
          { label: fr ? "Spots" : "Spots", value: String(recap.stops.length) },
          { label: fr ? "Croisé·es" : "Crossed", value: String(recap.crossed.length) },
          { label: "Likes", value: String(recap.likes) },
          ...(recap.matches > 0 ? [{ label: fr ? "Matchs" : "Matches", value: String(recap.matches) }] : []),
        ],
        footer: "whozin.app",
      });
      await shareImage(blob, "whozin-recap.png", fr ? "Ma soirée sur Whozin 🌅" : "My night on Whozin 🌅");
    } finally {
      setSharing(false);
    }
  }

  const hasNight = (recap?.stops.length ?? 0) > 0;
  // 🌙 17h+ : la fenêtre du RPC couvre la soirée EN COURS -> mode « retrace tes pas »
  const live = new Date().getHours() >= 17;

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-[var(--header)] px-4 py-3 backdrop-blur-xl pt-[max(12px,env(safe-area-inset-top))]">
        <Link href="/feed" className="text-text-dim">←</Link>
        <h1 className="flex-1 font-display text-xl font-extrabold">
          {live ? `🌙 ${fr ? "Ce soir" : "Tonight"}` : `🌅 ${fr ? "Ton recap" : "Your recap"}`}
        </h1>
        {live && hasNight && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-accent">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            {fr ? "EN DIRECT" : "LIVE"}
          </span>
        )}
      </header>

      {loading ? (
        <p className="py-20 text-center text-sm text-text-dim">…</p>
      ) : !hasNight ? (
        <div className="px-6 py-16 text-center">
          <p className="text-5xl">🌙</p>
          <h2 className="mt-3 font-display text-xl font-extrabold">
            {live
              ? fr ? "Pas encore de traces ce soir" : "No traces yet tonight"
              : fr ? "Pas de traces hier soir" : "No traces last night"}
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-text-dim">
            {live
              ? fr
                ? "Check-in quelque part et retrace tes pas ici, en direct."
                : "Check in somewhere and retrace your steps here, live."
              : fr
                ? "Check-in ce soir et demain matin ta nuit sera racontée ici."
                : "Check in tonight and tomorrow morning your night will be told here."}
          </p>
          <Link
            href="/map"
            className="brand-gradient pressable mt-6 inline-block rounded-full px-8 py-3 font-display text-sm font-bold text-white"
          >
            {fr ? "Voir la carte" : "See the map"}
          </Link>
        </div>
      ) : (
        <div className="px-4 py-5">
          {/* narration */}
          <div
            className="halo-card animate-glow-enter rounded-3xl p-5"
            style={{ "--glow": "var(--glow-gold, rgba(255,201,77,.45))", "--int": 0.7 } as React.CSSProperties}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>
              {live ? (fr ? "Ta soirée jusqu'ici" : "Your night so far") : fr ? "Hier soir" : "Last night"}
            </p>
            <p className="mt-1.5 font-display text-lg font-bold leading-snug">
              {narration ?? "…"}
            </p>
          </div>

          {/* stats */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { v: recap!.stops.length, l: fr ? "spots" : "spots", e: "📍" },
              { v: recap!.crossed.length, l: fr ? "croisé·es" : "crossed", e: "💫" },
              { v: recap!.likes, l: "likes", e: "❤️" },
            ].map((s, idx) => (
              <div
                key={s.l}
                className="animate-glow-enter rounded-2xl border border-border bg-surface px-3 py-3.5 text-center"
                style={{ "--i": idx + 1 } as React.CSSProperties}
              >
                <p className="font-display text-2xl font-extrabold">{s.e} {s.v}</p>
                <p className="mt-0.5 text-[11px] text-text-dim">{s.l}</p>
              </div>
            ))}
          </div>

          {/* timeline des arrêts */}
          <div className="mt-5 px-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-text-dim">
              {fr ? "Le parcours" : "The route"}
            </p>
            <div className="mt-3 flex flex-col">
              {recap!.stops.map((s, idx) => {
                const cat = getCategory(s.category);
                const time = new Date(s.at).toLocaleTimeString(fr ? "fr-CA" : "en-CA", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div key={idx} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span
                        className="mt-1 h-3.5 w-3.5 rounded-full"
                        style={{ background: cat.color, boxShadow: `0 0 12px ${cat.color}` }}
                      />
                      {idx < recap!.stops.length - 1 && (
                        <span className="w-px flex-1 bg-gradient-to-b from-text/25 to-text/5" />
                      )}
                    </div>
                    <div className="pb-5">
                      <p className="font-display text-base font-bold">
                        {cat.emoji} {s.name}
                      </p>
                      <p className="text-xs text-text-dim">{time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* croisés */}
          {recap!.crossed.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-text-dim">
                {fr ? "Sur ta route" : "On your way"}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {recap!.crossed.map((c) => (
                  <Link
                    key={c.username}
                    href={`/u/${c.username}`}
                    className="glass pressable flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5"
                  >
                    <span className="ring ring--static">
                      <Avatar profile={{ username: c.username, display_name: c.display_name, avatar_url: c.avatar_url }} size={28} />
                    </span>
                    <span className="text-sm font-bold">{c.display_name || c.username}</span>
                    <span className="text-[10px] text-text-dim">@ {c.place_name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {recap!.matches > 0 && (
            <div
              className="halo-card mt-4 flex items-center justify-between rounded-2xl px-4 py-3"
              style={{ "--glow": "var(--glow-rose)", "--int": 0.6 } as React.CSSProperties}
            >
              <span className="text-sm font-bold">
                💘 {recap!.matches} {fr ? "match cette nuit" : "match last night"}
              </span>
              <Link href="/messages" className="text-sm font-bold text-brand">
                {fr ? "Écris-leur →" : "Say hi →"}
              </Link>
            </div>
          )}

          <button
            onClick={share}
            disabled={sharing}
            className="glow-cta brand-gradient pressable mt-6 w-full rounded-full py-3.5 font-display text-sm font-bold text-white disabled:opacity-60"
          >
            {sharing ? "…" : `📤 ${fr ? "Partager mon recap" : "Share my recap"}`}
          </button>
        </div>
      )}
    </div>
  );
}
