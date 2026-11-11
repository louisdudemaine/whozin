"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";
import { pushNotify } from "@/lib/push";
import {
  extinguishBeacon,
  fetchActiveBeacons,
  fetchMutuals,
  launchBeacon,
  respondBeacon,
  type ActiveBeacon,
} from "@/lib/data";
import { Avatar } from "./Avatar";

/**
 * 🔦 Mode Balise — « Je sors à soir, qui est partant? »
 * Dès 2 partant·es : groupe créé automatiquement (côté serveur).
 */
export function BeaconStrip() {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const router = useRouter();
  const [beacons, setBeacons] = useState<ActiveBeacon[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchActiveBeacons().then(setBeacons).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const supabase = getSupabase();
    const chan = supabase
      .channel("beacons-live", { config: { private: true } })
      .on("postgres_changes", { event: "*", schema: "public", table: "beacon_responses" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(chan);
    };
  }, [load]);

  if (!profile) return null;
  const mine = beacons.find((b) => b.user_id === profile.id);
  const others = beacons.filter((b) => b.user_id !== profile.id);

  async function launch() {
    if (!profile || busy) return;
    setBusy(true);
    try {
      await launchBeacon(profile.id, fr ? "Je sors à soir 👀" : "Going out tonight 👀");
      // préviens la gang (mutuels)
      const me = profile.display_name || profile.username;
      const mutuals = await fetchMutuals(profile.id);
      for (const m of mutuals.slice(0, 25)) {
        pushNotify(m.id, {
          title: me, // le serveur titre au nom de l'expéditeur : l'emoji passe dans le texte
          body: fr ? "🔦 sort à soir — partant·e?" : "🔦 is going out tonight — you in?",
          url: "/feed",
          tag: "beacon",
        });
      }
      load();
    } finally {
      setBusy(false);
    }
  }

  async function respond(b: ActiveBeacon) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await respondBeacon(b.id);
      pushNotify(b.user_id, {
        title: profile?.display_name || profile?.username || "",
        body: fr ? "🔦 est partant·e!" : "🔦 is in!",
        url: r.conversation_id ? `/messages/${r.conversation_id}` : "/feed",
        tag: "beacon",
      });
      if (r.conversation_id) router.push(`/messages/${r.conversation_id}`);
      else load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="no-scrollbar flex items-center gap-3 overflow-x-auto">
        {/* ma balise / lancer */}
        {mine ? (
          <div
            className="halo-card halo-breathe flex shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2.5"
            style={{ "--glow": "rgba(255,201,77,.45)", "--int": 0.7 } as React.CSSProperties}
          >
            <span className="text-xl">🔦</span>
            <div className="leading-tight">
              <p className="text-sm font-bold">{fr ? "Ta balise est allumée" : "Your beacon is on"}</p>
              <p className="text-[11px] text-text-dim">
                {mine.responses} {fr ? "partant·e(s)" : "in"}
                {mine.conversation_id ? " · 👥" : ""}
              </p>
            </div>
            {mine.conversation_id && (
              <button
                onClick={() => router.push(`/messages/${mine.conversation_id}`)}
                className="brand-gradient pressable rounded-full px-3 py-1.5 text-xs font-bold text-white"
              >
                {fr ? "Ouvrir" : "Open"}
              </button>
            )}
            <button
              onClick={async () => {
                await extinguishBeacon(mine.id);
                load();
              }}
              className="text-xs text-text-dim"
            >
              {fr ? "Éteindre" : "Turn off"}
            </button>
          </div>
        ) : (
          <button
            onClick={launch}
            disabled={busy}
            className="glow-cta brand-gradient pressable flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 font-display text-sm font-bold text-white disabled:opacity-60"
          >
            🔦 {fr ? "Je sors à soir?" : "Going out tonight?"}
          </button>
        )}

        {/* balises des amis */}
        {others.map((b) => (
          <div
            key={b.id}
            className="halo-card flex shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2.5"
            style={{ "--glow": "rgba(255,201,77,.4)", "--int": 0.55 } as React.CSSProperties}
          >
            <span className="ring">
              <Avatar profile={b} size={36} />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold">
                {b.display_name || b.username} <span className="text-base">🔦</span>
              </p>
              <p className="text-[11px] text-text-dim">
                {b.message ?? (fr ? "sort à soir" : "going out")} · {b.responses}{" "}
                {fr ? "partant·e(s)" : "in"}
              </p>
            </div>
            {b.i_responded ? (
              b.conversation_id ? (
                <button
                  onClick={() => router.push(`/messages/${b.conversation_id}`)}
                  className="brand-gradient pressable rounded-full px-3 py-1.5 text-xs font-bold text-white"
                >
                  👥 {fr ? "Ouvrir" : "Open"}
                </button>
              ) : (
                <span className="text-xs font-bold text-accent">✓ {fr ? "Partant·e" : "In"}</span>
              )
            ) : (
              <button
                onClick={() => respond(b)}
                disabled={busy}
                className="brand-gradient pressable rounded-full px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {fr ? "Partant! 🙋" : "I'm in! 🙋"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
