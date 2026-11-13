"use client";

import { useCallback, useEffect, useState } from "react";
import { estTexteInterdit, getCategory, MONTREAL, type NearbyPlace, type PollData } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";
import { checkIn, createPoll, fetchNearby, fetchPoll, votePoll } from "@/lib/data";
// alias : PollCard a déjà un état nommé « toast »
import { toast as showToast } from "@/lib/toast";

/* ───────── Carte de sondage (dans le fil de groupe) ───────── */

export function PollCard({ pollId }: { pollId: string }) {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const [poll, setPoll] = useState<PollData | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    fetchPoll(pollId, profile.id).then(setPoll).catch(() => {});
  }, [pollId, profile]);

  useEffect(() => {
    load();
    const supabase = getSupabase();
    const chan = supabase
      .channel(`poll-${pollId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poll_votes", filter: `poll_id=eq.${pollId}` },
        load
      )
      .subscribe();
    return () => {
      supabase.removeChannel(chan);
    };
  }, [load, pollId]);

  if (!poll || !profile) {
    return <div className="glass w-64 rounded-2xl p-4 text-sm text-text-dim">📊 …</div>;
  }

  const max = Math.max(...poll.options.map((o) => o.votes), 1);
  const leader = poll.options.reduce((a, b) => (b.votes > a.votes ? b : a), poll.options[0]);

  async function vote(optionId: string) {
    if (!profile) return;
    await votePoll(poll!.id, optionId, profile.id);
    load();
  }

  async function goThere() {
    if (!profile || !leader?.place_id || !leader.place) return;
    await checkIn(profile.id, leader.place_id, fr ? "On s'est décidés ici 🗳️" : "The squad decided 🗳️", leader.place.lat, leader.place.lng);
    setToast(fr ? "Check-in fait 📍 à toi de jouer!" : "Checked in 📍");
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="w-72 rounded-2xl border border-border bg-surface p-4">
      <p className="font-display text-sm font-bold">📊 {poll.question}</p>
      <div className="mt-3 flex flex-col gap-2">
        {poll.options.map((o) => {
          const cat = o.place ? getCategory(o.place.category) : null;
          const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          const isLeader = poll.totalVotes > 0 && o.id === leader.id;
          return (
            <button
              key={o.id}
              onClick={() => vote(o.id)}
              className="pressable relative overflow-hidden rounded-xl border px-3 py-2.5 text-left"
              style={{ borderColor: o.myVote ? "var(--brand)" : "var(--border)" }}
            >
              <span
                className="absolute inset-y-0 left-0 opacity-25"
                style={{
                  width: `${(o.votes / max) * 100}%`,
                  background: cat ? cat.color : "var(--brand)",
                  transition: "width .4s cubic-bezier(.16,1,.3,1)",
                }}
              />
              <span className="relative flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-semibold">
                  {cat ? `${cat.emoji} ` : ""}
                  {o.label}
                  {o.myVote ? " ✓" : ""}
                </span>
                <span className="shrink-0 text-xs text-text-dim">
                  {o.votes > 0 ? `${pct}%` : ""}
                  {isLeader && poll.totalVotes > 0 ? " 👑" : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-xs text-text-dim">
          {poll.totalVotes} {fr ? "vote(s)" : "vote(s)"}
        </span>
        {leader?.place_id && poll.totalVotes > 0 && (
          <button onClick={goThere} className="brand-gradient pressable rounded-full px-3 py-1.5 text-xs font-bold text-white">
            📍 {fr ? "J'y vais" : "I'm in"}
          </button>
        )}
      </div>
      {toast && <p className="mt-2 text-xs font-semibold text-accent">{toast}</p>}
    </div>
  );
}

/* ───────── Composeur de sondage ───────── */

export function PollComposer({
  convId,
  onClose,
  onCreated,
}: {
  convId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const fr = locale === "fr";
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [picked, setPicked] = useState<NearbyPlace[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const center = (() => {
      try {
        const raw = localStorage.getItem("wi.lastCenter");
        return raw ? (JSON.parse(raw) as { lat: number; lng: number }) : MONTREAL;
      } catch {
        return MONTREAL;
      }
    })();
    fetchNearby(center.lat, center.lng).then(setPlaces).catch(() => {});
  }, []);

  function toggle(p: NearbyPlace) {
    setPicked((cur) =>
      cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : cur.length < 4 ? [...cur, p] : cur
    );
  }

  async function create() {
    if (!profile || picked.length < 2) return;
    setBusy(true);
    try {
      await createPoll(
        convId,
        profile.id,
        fr ? "On va où? 👀" : "Where to? 👀",
        picked.map((p) => ({ placeId: p.id, label: p.name }))
      );
      onCreated();
    } catch (e) {
      showToast(estTexteInterdit(e) ? t.common.forbiddenWord : t.common.error, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[480px] rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] animate-slide-up">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-text/20" />
        <h2 className="font-display text-lg font-bold">📊 {fr ? "On va où?" : "Where to?"}</h2>
        <p className="mt-0.5 text-xs text-text-dim">
          {fr ? "Choisis 2 à 4 lieux — la gang vote." : "Pick 2–4 places — the squad votes."}
        </p>
        <div className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
          {places.slice(0, 16).map((p) => {
            const cat = getCategory(p.category);
            const on = picked.some((x) => x.id === p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p)}
                className="flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold"
                style={{
                  borderColor: on ? cat.color : "var(--border)",
                  background: on ? cat.color + "26" : "var(--surface-2)",
                  color: on ? cat.color : "var(--text)",
                }}
              >
                {cat.emoji} <span className="max-w-[140px] truncate">{p.name}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={create}
          disabled={busy || picked.length < 2}
          className="glow-cta brand-gradient pressable mt-4 w-full rounded-full py-3.5 font-display text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "…" : fr ? `Lancer le vote (${picked.length})` : `Start the vote (${picked.length})`}
        </button>
      </div>
    </div>
  );
}
