"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DatingCandidate } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  datingLike,
  fetchDatingCandidates,
  fetchDatingProfile,
  upsertDatingProfile,
} from "@/lib/data";
import { Avatar } from "@/components/Avatar";

type View = "loading" | "onboarding" | "deck";

export default function DatingPage() {
  const { profile } = useAuth();
  const { locale } = useT();
  const [view, setView] = useState<View>("loading");
  const [vibe, setVibe] = useState("");
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<DatingCandidate[]>([]);
  const [i, setI] = useState(0);
  const [match, setMatch] = useState<{ who: DatingCandidate; convId: string | null } | null>(null);

  useEffect(() => {
    if (!profile) return;
    fetchDatingProfile(profile.id).then((dp) => {
      if (dp?.enabled) {
        setVibe(dp.vibe ?? "");
        loadDeck();
      } else {
        setView("onboarding");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function loadDeck() {
    const c = await fetchDatingCandidates();
    setCards(c);
    setI(0);
    setView("deck");
  }

  async function enable() {
    if (!profile) return;
    setBusy(true);
    try {
      await upsertDatingProfile(profile.id, true, vibe.trim());
      await loadDeck();
    } finally {
      setBusy(false);
    }
  }

  const current = cards[i];

  async function like() {
    if (!current) return;
    const who = current;
    setI((n) => n + 1);
    const res = await datingLike(who.id);
    if (res.matched) setMatch({ who, convId: res.conversation_id });
  }
  function pass() {
    setI((n) => n + 1);
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md pt-[max(12px,env(safe-area-inset-top))]">
        <Link href="/feed" className="text-text-dim">←</Link>
        <h1 className="flex-1 text-xl font-black">
          Rencontres <span className="text-gradient">·</span> <span className="text-base font-semibold text-text-dim">{locale === "fr" ? "relax" : "chill"}</span>
        </h1>
        {view === "deck" && (
          <button
            onClick={() => setView("onboarding")}
            className="text-xs text-text-dim"
            aria-label="Réglages"
          >
            ⚙︎
          </button>
        )}
      </header>

      {view === "loading" && <p className="py-20 text-center text-sm text-text-dim">…</p>}

      {view === "onboarding" && (
        <div className="px-6 py-8">
          <div className="brand-gradient mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-3xl">💘</div>
          <h2 className="text-2xl font-black">{locale === "fr" ? "Fais des rencontres, sans pression." : "Meet people, no pressure."}</h2>
          <p className="mt-1 text-sm text-text-dim">
            {locale === "fr"
              ? "Découvre des gens qui sortent près de toi. Un match s'ouvre seulement si c'est réciproque."
              : "Discover people out near you. A match only opens if it's mutual."}
          </p>

          <label className="mt-6 block text-xs font-medium text-text-dim">
            {locale === "fr" ? "Ta vibe (visible sur ta carte)" : "Your vibe (shown on your card)"}
          </label>
          <input
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            maxLength={120}
            placeholder={locale === "fr" ? "Ex : café le matin, danse le soir ☕🪩" : "e.g. coffee mornings, dancing nights"}
            className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
          />

          <button
            onClick={enable}
            disabled={busy}
            className="brand-gradient mt-6 w-full rounded-xl py-3.5 font-bold text-white disabled:opacity-60"
          >
            {busy ? "…" : locale === "fr" ? "Activer les rencontres" : "Turn on dating"}
          </button>
          <p className="mt-3 text-center text-xs text-text-dim">
            {locale === "fr" ? "Tu peux te désactiver à tout moment." : "You can turn it off anytime."}
          </p>
        </div>
      )}

      {view === "deck" && (
        <div className="px-4 py-6">
          {current ? (
            <div className="overflow-hidden rounded-3xl border border-border bg-surface">
              <div className="brand-gradient flex h-64 items-center justify-center">
                <Avatar profile={{ username: current.username, display_name: current.display_name, avatar_url: current.avatar_url }} size={140} />
              </div>
              <div className="p-5">
                <p className="text-xl font-black">
                  {current.display_name || current.username}
                </p>
                {current.vibe && <p className="mt-1 text-sm text-brand-2">“{current.vibe}”</p>}
                {current.bio && <p className="mt-2 text-sm text-text-dim">{current.bio}</p>}
              </div>
              <div className="flex gap-3 p-5 pt-0">
                <button
                  onClick={pass}
                  className="flex-1 rounded-2xl border border-border py-4 text-base font-bold text-text-dim"
                >
                  {locale === "fr" ? "Passer" : "Pass"}
                </button>
                <button
                  onClick={like}
                  className="brand-gradient flex-1 rounded-2xl py-4 text-base font-bold text-white"
                >
                  {locale === "fr" ? "Intéressé·e 👋" : "Interested 👋"}
                </button>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="mb-2 text-4xl">🌙</p>
              <p className="text-sm text-text-dim">
                {locale === "fr"
                  ? "Plus personne pour l'instant. Reviens plus tard !"
                  : "Nobody left for now. Check back later!"}
              </p>
              <button onClick={loadDeck} className="mt-4 text-sm text-brand">
                {locale === "fr" ? "Rafraîchir" : "Refresh"}
              </button>
            </div>
          )}
        </div>
      )}

      {match && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMatch(null)} />
          <div className="relative w-full max-w-sm rounded-3xl border border-border bg-surface p-6 text-center animate-fade">
            <p className="text-5xl">💘</p>
            <h2 className="mt-2 text-2xl font-black text-gradient">
              {locale === "fr" ? "C'est un match !" : "It's a match!"}
            </h2>
            <p className="mt-1 text-sm text-text-dim">
              {locale === "fr"
                ? `Toi et ${match.who.display_name || match.who.username} vous êtes plu·es.`
                : `You and ${match.who.display_name || match.who.username} liked each other.`}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {match.convId && (
                <Link
                  href={`/messages/${match.convId}`}
                  className="brand-gradient rounded-xl py-3 font-bold text-white"
                >
                  {locale === "fr" ? "Envoyer un message" : "Send a message"}
                </Link>
              )}
              <button
                onClick={() => setMatch(null)}
                className="rounded-xl border border-border py-3 font-semibold text-text-dim"
              >
                {locale === "fr" ? "Continuer" : "Keep browsing"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
