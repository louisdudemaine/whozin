"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MONTREAL } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";
import { fetchPartnerEvents, fetchRsvpInfo, rsvpEvent, unRsvpEvent } from "@/lib/data";
import type { WhozinEvent } from "@/app/api/events/route";

interface MergedEvent extends WhozinEvent {
  /** événement créé par un partenaire Whozin (vs billetterie externe) */
  isPartner?: boolean;
}

type Segment = WhozinEvent["segment"];
type Filter = "all" | Segment;

const CHIPS: { key: Filter; emoji: string; fr: string; en: string }[] = [
  { key: "all", emoji: "✨", fr: "Tous", en: "All" },
  { key: "music", emoji: "🎶", fr: "Musique", en: "Music" },
  { key: "comedy", emoji: "🎤", fr: "Humour", en: "Comedy" },
  { key: "pro", emoji: "💼", fr: "Réseautage", en: "Networking" },
  { key: "sports", emoji: "🏟️", fr: "Sports", en: "Sports" },
  { key: "arts", emoji: "🎭", fr: "Arts", en: "Arts" },
];

/** Catégories Whozin -> segments d'événements (pont avec l'algo de goûts). */
const CAT_TO_SEGMENT: Record<string, Segment> = {
  festival: "music",
  concert_hall: "music",
  club: "music",
  bar: "music",
  stadium: "sports",
};

export default function EventsPage() {
  const { locale } = useT();
  const { profile } = useAuth();
  const fr = locale === "fr";
  const [events, setEvents] = useState<MergedEvent[]>([]);
  const [rsvps, setRsvps] = useState<Map<string, { count: number; mine: boolean }>>(new Map());
  const [source, setSource] = useState<"demo" | "ticketmaster">("demo");
  const [filter, setFilter] = useState<Filter>("all");
  const [tasteSegments, setTasteSegments] = useState<Set<Segment>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const center = (() => {
      try {
        const raw = localStorage.getItem("wi.lastCenter");
        return raw ? (JSON.parse(raw) as { lat: number; lng: number }) : MONTREAL;
      } catch {
        return MONTREAL;
      }
    })();

    Promise.all([
      fetch(`/api/events?lat=${center.lat}&lng=${center.lng}`).then((r) => r.json()),
      getSupabase().rpc("my_category_affinity"),
      fetchPartnerEvents().catch(() => []),
    ])
      .then(([ev, aff, partnerEvs]) => {
        // les événements des partenaires Whozin d'abord (badge), puis la billetterie
        const internal: MergedEvent[] = partnerEvs.map((e) => ({
          id: `wz-${e.id}`,
          name: e.title,
          segment: (e.segment as MergedEvent["segment"]) ?? "other",
          date: e.starts_at,
          venue: e.place?.name ?? "",
          city: "Montréal",
          image: null,
          url: e.ticket_url,
          priceMin: e.price_min != null ? Number(e.price_min) : null,
          lat: e.place?.lat ?? null,
          lng: e.place?.lng ?? null,
          isPartner: true,
        }));
        setEvents([...internal, ...(ev.events ?? [])]);
        setSource(ev.source ?? "demo");
        // RSVP des événements Whozin
        const ids = partnerEvs.map((e) => e.id);
        const me = profile?.id;
        if (ids.length && me) fetchRsvpInfo(ids, me).then(setRsvps).catch(() => {});
        const segs = new Set<Segment>();
        for (const row of (aff.data ?? []) as { category: string; score: number }[]) {
          const s = CAT_TO_SEGMENT[row.category];
          if (s) segs.add(s);
        }
        setTasteSegments(segs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const shown = useMemo(() => {
    const list = filter === "all" ? events : events.filter((e) => e.segment === filter);
    // « Pour toi » : les segments qui matchent tes goûts remontent, puis par date
    return [...list].sort((a, b) => {
      const pa = a.isPartner ? 0 : 1;
      const pb = b.isPartner ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ta = tasteSegments.has(a.segment) ? 0 : 1;
      const tb = tasteSegments.has(b.segment) ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [events, filter, tasteSegments]);

  function fmtDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <Link href="/feed" className="text-text-dim">←</Link>
          <h1 className="text-xl font-black">
            🎟️ {fr ? "Activités & événements" : "Things to do"}
          </h1>
        </div>
        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className="shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold"
              style={{
                borderColor: filter === c.key ? "var(--brand)" : "var(--border)",
                color: filter === c.key ? "var(--brand)" : "var(--text-dim)",
                background: filter === c.key ? "var(--surface-2)" : "transparent",
              }}
            >
              {c.emoji} {fr ? c.fr : c.en}
            </button>
          ))}
        </div>
      </header>

      {source === "demo" && !loading && (
        <p className="border-b border-border bg-surface px-4 py-2 text-xs text-text-dim">
          {fr
            ? "Aperçu — billetterie Ticketmaster bientôt branchée."
            : "Preview — Ticketmaster ticketing coming soon."}
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-text-dim">…</p>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-dim">
          {fr ? "Aucun événement trouvé par ici." : "No events found around here."}
        </p>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {shown.map((e) => (
            <article
              key={e.id}
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              {e.image && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.image} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                  {tasteSegments.has(e.segment) && (
                    <span className="brand-gradient absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-bold text-white">
                      {fr ? "Pour toi ✨" : "For you ✨"}
                    </span>
                  )}
                </div>
              )}
              <div className="p-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-2">
                  {fmtDate(e.date)}
                  {e.isPartner && (
                    <span className="brand-gradient rounded-full px-2 py-0.5 text-[9px] font-bold normal-case text-white">
                      Whozin
                    </span>
                  )}
                </p>
                <h2 className="mt-0.5 text-base font-black leading-snug">{e.name}</h2>
                <p className="mt-0.5 text-sm text-text-dim">
                  {e.venue}
                  {e.city ? ` · ${e.city}` : ""}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-accent">
                    {e.priceMin != null
                      ? fr
                        ? `À partir de ${e.priceMin} $`
                        : `From $${e.priceMin}`
                      : fr
                        ? "Gratuit / variable"
                        : "Free / varies"}
                  </span>
                  {e.isPartner && profile ? (
                    <div className="flex items-center gap-2">
                      {(rsvps.get(e.id.replace(/^wz-/, ""))?.count ?? 0) > 0 && (
                        <span className="text-xs font-bold text-accent">
                          {rsvps.get(e.id.replace(/^wz-/, ""))!.count} {fr ? "y vont" : "going"}
                        </span>
                      )}
                      <button
                        onClick={async () => {
                          const realId = e.id.replace(/^wz-/, "");
                          const cur = rsvps.get(realId);
                          if (cur?.mine) await unRsvpEvent(realId, profile.id);
                          else await rsvpEvent(realId, profile.id);
                          fetchRsvpInfo([realId], profile.id).then((m) =>
                            setRsvps((prev) => new Map([...prev, ...m]))
                          );
                        }}
                        className={
                          rsvps.get(e.id.replace(/^wz-/, ""))?.mine
                            ? "rounded-xl border border-accent px-4 py-2 text-sm font-bold text-accent"
                            : "glow-cta brand-gradient pressable rounded-xl px-4 py-2 text-sm font-bold text-white"
                        }
                      >
                        {rsvps.get(e.id.replace(/^wz-/, ""))?.mine
                          ? `✓ ${fr ? "J'y vais" : "Going"}`
                          : fr ? "J'y vais 🎟️" : "I'm going 🎟️"}
                      </button>
                    </div>
                  ) : e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="brand-gradient rounded-xl px-4 py-2 text-sm font-bold text-white"
                    >
                      {fr ? "Billets 🎟️" : "Tickets 🎟️"}
                    </a>
                  ) : (
                    <span className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-dim">
                      {fr ? "Bientôt" : "Soon"}
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
