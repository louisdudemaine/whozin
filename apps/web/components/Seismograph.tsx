"use client";

import { useEffect, useState } from "react";
import type { CityPulse } from "@whosin/shared";
import { getCategory } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { fetchCityPulse } from "@/lib/data";

/** 📈 Sismographe d'ambiance — le pouls de la ville en une ligne de lumière. */
export function Seismograph() {
  const { locale } = useT();
  const fr = locale === "fr";
  const [pulse, setPulse] = useState<CityPulse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => fetchCityPulse().then((p) => alive && setPulse(p));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!pulse || !pulse.series?.length) return null;

  const max = Math.max(...pulse.series.map((s) => s.n), 1);
  const W = 320;
  const H = 64;
  const step = W / (pulse.series.length - 1);
  const pts = pulse.series.map((s, i) => ({
    x: i * step,
    y: H - 6 - (s.n / max) * (H - 16),
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  // magnitude -> couleur + humeur
  const m = Number(pulse.magnitude ?? 0);
  const [color, mood] =
    m >= 2
      ? ["#FF2E63", fr ? "Ça brasse 🔥" : "It's shaking 🔥"]
      : m >= 1
        ? ["#FF7849", fr ? "Ça bouge" : "Moving"]
        : ["#16D9C5", fr ? "Calme plat" : "Flat calm"];
  const cat = pulse.top_category ? getCategory(pulse.top_category) : null;

  return (
    <div
      className="halo-card mx-3 mt-3 rounded-3xl p-4"
      style={{ "--glow": `${color}55`, "--int": 0.55 } as React.CSSProperties}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-text-dim">
          📈 {fr ? "Sismographe" : "Seismograph"}
        </p>
        <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color }}>
          <span className="live-dot" style={{ width: 6, height: 6, background: color }} />
          {mood}
        </span>
      </div>

      <div className="mt-2 flex items-end gap-4">
        <div>
          <p className="font-display text-3xl font-extrabold leading-none" style={{ color }}>
            M&thinsp;{m.toFixed(1)}
          </p>
          <p className="mt-1 text-[11px] text-text-dim">
            <b className="text-text">{pulse.live_now}</b> {fr ? "sur place là" : "out right now"}
            {cat && pulse.top_category_n > 0 && (
              <>
                {" · "}
                {cat.emoji} {cat.label[fr ? "fr" : "en"]}
              </>
            )}
          </p>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="h-16 min-w-0 flex-1" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="sis-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#16D9C5" />
              <stop offset="55%" stopColor="#FF7849" />
              <stop offset="100%" stopColor="#FF2E63" />
            </linearGradient>
            <linearGradient id="sis-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#sis-fill)" />
          <path
            d={line}
            fill="none"
            stroke="url(#sis-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
          {/* point courant qui pulse */}
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3.5" fill={color}>
            <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>

      <div className="mt-1 flex justify-between text-[9px] text-text-dim">
        <span>{pulse.series[0]?.h}</span>
        <span>{pulse.series[Math.floor(pulse.series.length / 2)]?.h}</span>
        <span>{fr ? "maintenant" : "now"}</span>
      </div>
    </div>
  );
}
