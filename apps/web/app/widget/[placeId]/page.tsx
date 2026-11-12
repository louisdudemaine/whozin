"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getCategory } from "@whosin/shared";
import { getSupabase } from "@/lib/supabase";

interface WidgetData {
  name: string;
  category: string;
  /** null sous le seuil d'anonymat (moins de 3 personnes) */
  active: number | null;
  today: number | null;
  next_event: { title: string; starts_at: string } | null;
}

/**
 * 🪟 Widget B2B — embarquable en iframe sur le site d'un lieu.
 * Public (agrégats anonymes seulement), aucune auth, poll 30 s.
 */
export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WidgetInner />
    </Suspense>
  );
}

function WidgetInner() {
  const { placeId } = useParams<{ placeId: string }>();
  const search = useSearchParams();
  const fr = search.get("lang") !== "en";
  const [data, setData] = useState<WidgetData | null>(null);

  useEffect(() => {
    if (!placeId) return;
    let alive = true;
    const load = async () => {
      const { data: d } = await getSupabase().rpc("place_widget", { pid: placeId });
      if (alive && d) setData(d as WidgetData);
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [placeId]);

  if (!data) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-sm text-text-dim">…</div>
    );
  }

  const cat = getCategory(data.category);
  const hot = (data.active ?? 0) > 0;

  return (
    <div className="flex h-[100dvh] items-center justify-center p-3">
      <a
        href={`https://whozin.app`}
        target="_blank"
        rel="noopener noreferrer"
        className="halo-card block w-full max-w-sm rounded-3xl p-5 no-underline"
        style={{ "--glow": `${cat.color}66`, "--int": hot ? 0.8 : 0.4 } as React.CSSProperties}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: cat.color }}>
            {cat.emoji} {data.name}
          </p>
          {hot && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-accent">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              LIVE
            </span>
          )}
        </div>

        <div className="mt-3 flex items-end gap-2">
          <span className="font-display text-5xl font-extrabold leading-none text-gradient">
            {data.active ?? "0–2"}
          </span>
          <span className="pb-1 text-sm text-text-dim">
            {fr
              ? data.active === 1 ? "personne ici en ce moment" : "personnes ici en ce moment"
              : data.active === 1 ? "person here right now" : "people here right now"}
          </span>
        </div>

        <p className="mt-2 text-xs text-text-dim">
          <b className="text-text">{data.today ?? (fr ? "Peu de" : "Few")}</b> {fr ? "visites aujourd'hui" : "visits today"}
          {data.next_event && (
            <>
              {" · "}📅 {data.next_event.title}
            </>
          )}
        </p>

        <p className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-text-dim">
          {fr ? "Suivi en direct par" : "Tracked live by"}
          <span className="font-display text-text">
            Whoz<span className="text-gradient">in</span>
          </span>
        </p>
      </a>
    </div>
  );
}
