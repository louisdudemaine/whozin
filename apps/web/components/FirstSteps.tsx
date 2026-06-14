"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SuggestedPerson } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  fetchActivation,
  fetchSuggestedPeople,
  follow,
  type ActivationStatus,
} from "@/lib/data";
import { hapticSuccess } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { Avatar } from "./Avatar";

/** 🎯 Premiers pas — mène le nouvel utilisateur à sa 1re vraie connexion. */
export function FirstSteps() {
  const { profile } = useAuth();
  const { locale } = useT();
  const router = useRouter();
  const fr = locale === "fr";
  const [act, setAct] = useState<ActivationStatus | null>(null);
  const [people, setPeople] = useState<SuggestedPerson[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  const load = useCallback(() => {
    fetchActivation().then(setAct);
  }, []);

  useEffect(() => {
    load();
    fetchSuggestedPeople(6).then(setPeople).catch(() => {});
    const onRefresh = () => load();
    window.addEventListener("wi:refresh", onRefresh);
    return () => window.removeEventListener("wi:refresh", onRefresh);
  }, [load]);

  const follows = (act?.follows ?? 0) + followed.size;
  const stepFollow = follows >= 3;
  const stepMove = !!act?.has_move;
  const stepCheckin = !!act?.has_checkin;
  const done = stepFollow && stepMove && stepCheckin;

  useEffect(() => {
    if (done && !celebrated && act) {
      setCelebrated(true);
      hapticSuccess();
      toast(fr ? "🎉 Te voilà prêt·e pour ta 1re soirée!" : "🎉 You're set for your first night!");
      setTimeout(() => setDismissed(true), 2600);
    }
  }, [done, celebrated, act, fr]);

  // n'apparaît que pour les nouveaux comptes pas encore activés
  if (!act || !act.is_new || dismissed || (done && celebrated && dismissed)) return null;
  if (done && dismissed) return null;

  async function onFollow(id: string) {
    if (!profile) return;
    hapticSuccess();
    setFollowed((s) => new Set(s).add(id));
    try {
      await follow(profile.id, id);
    } catch {
      /* ignore */
    }
  }

  const total = 3;
  const completed = [stepFollow, stepMove, stepCheckin].filter(Boolean).length;

  return (
    <div
      className="halo-card animate-glow-enter mx-3 mt-3 rounded-3xl p-4"
      style={{ "--glow": "var(--glow-rose)", "--int": 0.6 } as React.CSSProperties}
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-base font-bold">
          🎯 {fr ? "Tes premiers pas" : "Your first steps"}
        </p>
        <span className="text-xs font-bold text-text-dim">{completed}/{total}</span>
      </div>

      {/* progression */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${(completed / total) * 100}%`, background: "linear-gradient(90deg, var(--brand), var(--brand-2))" }}
        />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {/* 1) suivre 3 personnes — suggestions inline */}
        <Step done={stepFollow} emoji="👋" label={fr ? `Suis 3 personnes (${Math.min(follows, 3)}/3)` : `Follow 3 people (${Math.min(follows, 3)}/3)`} />
        {!stepFollow && people.length > 0 && (
          <div className="no-scrollbar -mt-0.5 mb-1 flex gap-2 overflow-x-auto pl-7">
            {people.filter((p) => !followed.has(p.id)).slice(0, 5).map((p) => (
              <button
                key={p.id}
                onClick={() => onFollow(p.id)}
                className="pressable flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl border border-border bg-surface-2 p-2"
              >
                <Avatar profile={p} size={36} />
                <span className="w-full truncate text-center text-[10px] font-bold">{p.display_name || p.username}</span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold text-white" style={{ background: "var(--brand)" }}>
                  + {fr ? "Suivre" : "Follow"}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 2) poser son premier move */}
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="text-left">
          <Step done={stepMove} emoji="🌃" label={fr ? "Pose ton premier Move" : "Drop your first Move"} cta={!stepMove ? (fr ? "C'est quoi le move?" : "What's the move?") : undefined} />
        </button>

        {/* 3) premier check-in */}
        <button onClick={() => router.push("/map")} className="text-left">
          <Step done={stepCheckin} emoji="📍" label={fr ? "Fais ton premier check-in" : "Make your first check-in"} cta={!stepCheckin ? (fr ? "Ouvrir la carte" : "Open the map") : undefined} />
        </button>
      </div>
    </div>
  );
}

function Step({ done, emoji, label, cta }: { done: boolean; emoji: string; label: string; cta?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]"
        style={done ? { background: "var(--accent)", color: "#04130f" } : { border: "1.5px solid var(--border)" }}
      >
        {done ? "✓" : ""}
      </span>
      <span className="flex-1">
        <span className={`text-sm font-bold ${done ? "text-text-dim line-through" : "text-text"}`}>
          {emoji} {label}
        </span>
        {cta && <span className="ml-2 text-xs font-bold text-brand">{cta} →</span>}
      </span>
    </div>
  );
}
