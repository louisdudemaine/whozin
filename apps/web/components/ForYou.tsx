"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";
import { fetchForYou, type BrainSignal } from "@/lib/data";
import { Avatar } from "./Avatar";

/** halo couleur selon le type de signal */
const GLOW: Record<BrainSignal["kind"], string> = {
  move: "rgba(225,79,255,.4)",
  crew: "rgba(77,159,255,.4)",
  hot: "rgba(255,46,99,.45)",
  beacon: "rgba(255,201,77,.45)",
};

/** 🧠 Le Cerveau Whozin — « Pour toi, ce soir » : les signaux les plus chauds, classés. */
export function ForYou() {
  const { locale } = useT();
  const fr = locale === "fr";
  const router = useRouter();
  const [signals, setSignals] = useState<BrainSignal[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    fetchForYou().then((s) => {
      setSignals(s);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    load();
    // se rafraîchit quand la ville bouge (check-ins ; moves n'est pas publiée)
    const supabase = getSupabase();
    const ch = supabase
      .channel("brain-live", { config: { private: true } })
      .on("postgres_changes", { event: "*", schema: "public", table: "check_ins" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  if (!loaded || signals.length === 0) return null;

  return (
    <div className="mt-3 px-3">
      <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-text-dim">
        🧠 {fr ? "Pour toi, ce soir" : "For you, tonight"}
      </p>
      <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
        {signals.map((s, i) => (
          <button
            key={`${s.kind}-${i}`}
            onClick={() => router.push(s.href)}
            className="halo-card animate-glow-enter pressable flex w-[230px] shrink-0 items-center gap-3 rounded-2xl p-3 text-left"
            style={{ "--glow": GLOW[s.kind], "--int": 0.6, "--i": i } as React.CSSProperties}
          >
            {s.username ? (
              <span className="ring ring--static shrink-0">
                <Avatar profile={{ username: s.username, display_name: s.title, avatar_url: s.avatar_url ?? null }} size={40} />
              </span>
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl" style={{ background: "var(--surface-2)" }}>
                {s.emoji}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-bold">
                {s.username && <span>{s.emoji}</span>}
                <span className="truncate">{s.title}</span>
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-text-dim">{s.subtitle}</span>
            </span>
            <span className="text-text-dim">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
