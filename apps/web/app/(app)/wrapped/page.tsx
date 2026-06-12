"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCategory } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";
import { renderShareCard, shareImage } from "@/lib/sharecard";

interface WrappedStats {
  checkins: number;
  places: number;
  topPlace: string | null;
  topEmoji: string;
  topColor: string;
  topCategory: string | null;
  crossings: number;
}

/** Whozin Wrapped — ton mois de sorties, en mode récap partageable. */
export default function WrappedPage() {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const [stats, setStats] = useState<WrappedStats | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const supabase = getSupabase();
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("check_ins")
        .select("place_id, created_at, place:places(name, category)")
        .eq("user_id", profile.id)
        .gte("created_at", start.toISOString());
      const rows = (data ?? []) as unknown as {
        place_id: string;
        place: { name: string; category: string } | null;
      }[];

      const byPlace = new Map<string, { name: string; category: string; n: number }>();
      for (const r of rows) {
        if (!r.place) continue;
        const e = byPlace.get(r.place_id) ?? { ...r.place, n: 0 };
        e.n++;
        byPlace.set(r.place_id, e);
      }
      const top = [...byPlace.values()].sort((a, b) => b.n - a.n)[0] ?? null;
      const cat = top ? getCategory(top.category) : getCategory("other");

      setStats({
        checkins: rows.length,
        places: byPlace.size,
        topPlace: top?.name ?? null,
        topEmoji: cat.emoji,
        topColor: cat.color,
        topCategory: top ? cat.label[locale] : null,
        crossings: 0,
      });
    })();
  }, [profile, locale]);

  const monthName = new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { month: "long" }).format(new Date());

  async function share() {
    if (!stats) return;
    setBusy(true);
    try {
      const blob = await renderShareCard({
        title: fr ? `Mon ${monthName} en sorties` : `My ${monthName} nights`,
        emoji: stats.topEmoji,
        accent: stats.topColor,
        lines: [
          { label: fr ? "Check-ins" : "Check-ins", value: String(stats.checkins) },
          { label: fr ? "Lieux explorés" : "Places explored", value: String(stats.places) },
          ...(stats.topPlace ? [{ label: fr ? "QG du mois" : "HQ of the month", value: stats.topPlace }] : []),
        ],
        footer: "Whozin — " + (fr ? "La ville s'allume. T'es où?" : "The city lights up. Where you at?"),
      });
      await shareImage(blob, "whozin-wrapped.png", "Mon Whozin Wrapped 🌃");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-[var(--header)] px-4 py-3 backdrop-blur-xl pt-[max(12px,env(safe-area-inset-top))]">
        <Link href="/profile" className="text-text-dim">←</Link>
        <h1 className="font-display text-xl font-extrabold">
          🎁 Wrapped <span className="text-gradient">{monthName}</span>
        </h1>
      </header>

      {!stats ? (
        <p className="py-20 text-center text-sm text-text-dim">…</p>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <div
            className="halo-card halo-breathe animate-glow-enter rounded-3xl p-6 text-center"
            style={{ "--glow": "var(--glow-rose)", "--int": 0.7 } as React.CSSProperties}
          >
            <p className="text-6xl">{stats.topEmoji}</p>
            <p className="font-display mt-4 text-5xl font-extrabold text-gradient">{stats.checkins}</p>
            <p className="mt-1 text-sm text-text-dim">
              {fr ? "sorties ce mois-ci" : "nights out this month"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard
              n={String(stats.places)}
              label={fr ? "lieux explorés" : "places explored"}
              i={1}
            />
            <StatCard
              n={stats.topPlace ? "👑" : "—"}
              label={stats.topPlace ?? (fr ? "pas encore de QG" : "no HQ yet")}
              i={2}
            />
          </div>

          {stats.topCategory && (
            <p className="text-center text-sm text-text-dim">
              {fr ? "Ta vibe du mois :" : "Your vibe this month:"}{" "}
              <b style={{ color: stats.topColor }}>{stats.topCategory}</b>
            </p>
          )}

          <button
            onClick={share}
            disabled={busy}
            className="glow-cta brand-gradient pressable mt-2 rounded-full py-4 font-display text-base font-bold text-white disabled:opacity-60"
          >
            {busy ? "…" : `📤 ${fr ? "Partager mon Wrapped" : "Share my Wrapped"}`}
          </button>
          <p className="text-center text-xs text-text-dim">
            {fr ? "Image format story — parfaite pour Instagram." : "Story-sized image — perfect for Instagram."}
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ n, label, i }: { n: string; label: string; i: number }) {
  return (
    <div
      className="animate-glow-enter rounded-3xl border border-border bg-surface p-5 text-center"
      style={{ "--i": i } as React.CSSProperties}
    >
      <p className="font-display truncate text-2xl font-extrabold">{n}</p>
      <p className="mt-1 truncate text-xs text-text-dim">{label}</p>
    </div>
  );
}
