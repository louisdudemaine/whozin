"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getCategory, MONTREAL, type NearbyPlace } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  claimPlace,
  createPartnerEvent,
  deletePartnerEvent,
  fetchMyPartnerPlace,
  fetchNearby,
  fetchPartnerEvents,
  fetchPartnerStats,
  type PartnerEvent,
  type PartnerPlace,
  type PartnerStats,
} from "@/lib/data";

const SEGMENTS = [
  { key: "music", emoji: "🎶", fr: "Musique", en: "Music" },
  { key: "comedy", emoji: "🎤", fr: "Humour", en: "Comedy" },
  { key: "sports", emoji: "🏟️", fr: "Sports", en: "Sports" },
  { key: "arts", emoji: "🎭", fr: "Arts", en: "Arts" },
  { key: "other", emoji: "🎉", fr: "Autre", en: "Other" },
];

/** 🏪 Portail partenaire — revendique ton lieu, vois ton affluence, crée tes événements. */
export default function PartnerPage() {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const [partner, setPartner] = useState<PartnerPlace | null | undefined>(undefined);
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [events, setEvents] = useState<PartnerEvent[]>([]);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [busy, setBusy] = useState(false);

  // formulaire événement
  const [title, setTitle] = useState("");
  const [segment, setSegment] = useState("music");
  const [when, setWhen] = useState("");
  const [price, setPrice] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");

  const load = useCallback(async () => {
    if (!profile) return;
    const p = await fetchMyPartnerPlace(profile.id);
    setPartner(p);
    if (p) {
      fetchPartnerStats(p.place_id).then(setStats).catch(() => {});
      fetchPartnerEvents(p.place_id).then(setEvents).catch(() => {});
    } else {
      fetchNearby(MONTREAL.lat, MONTREAL.lng).then(setPlaces).catch(() => {});
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function doClaim(placeId: string) {
    if (!profile) return;
    setBusy(true);
    try {
      await claimPlace(profile.id, placeId);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function doCreate() {
    if (!profile || !partner || !title.trim() || !when) return;
    setBusy(true);
    try {
      await createPartnerEvent(profile.id, partner.place_id, {
        title: title.trim(),
        segment,
        starts_at: new Date(when).toISOString(),
        price_min: price ? Number(price) : null,
        ticket_url: ticketUrl.trim() || null,
      });
      setTitle("");
      setWhen("");
      setPrice("");
      setTicketUrl("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const cat = partner?.place ? getCategory(partner.place.category) : null;

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-[rgba(7,7,13,0.72)] px-4 py-3 backdrop-blur-xl pt-[max(12px,env(safe-area-inset-top))]">
        <Link href="/profile" className="text-text-dim">←</Link>
        <h1 className="font-display text-xl font-extrabold">
          🏪 {fr ? "Portail partenaire" : "Partner portal"}
        </h1>
      </header>

      {partner === undefined ? (
        <p className="py-16 text-center text-sm text-text-dim">…</p>
      ) : partner === null ? (
        /* ── revendication ── */
        <div className="p-4">
          <p className="font-display text-2xl font-extrabold leading-tight">
            {fr ? "C'est ton lieu?" : "Your venue?"}
            <br />
            <span className="text-gradient">{fr ? "Prends les commandes." : "Take the wheel."}</span>
          </p>
          <p className="mt-1.5 text-sm text-text-dim">
            {fr
              ? "Revendique ton bar/resto/salle : vois ton affluence Whozin en direct et publie tes événements gratuitement."
              : "Claim your bar/restaurant/venue: see your live Whozin crowd and post your events for free."}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {places.map((p) => {
              const c = getCategory(p.category);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
                  <span className="text-2xl">{c.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="text-xs" style={{ color: c.color }}>{c.label[locale]}</p>
                  </div>
                  <button
                    onClick={() => doClaim(p.id)}
                    disabled={busy}
                    className="brand-gradient pressable shrink-0 rounded-full px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {fr ? "Revendiquer" : "Claim"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── dashboard ── */
        <div className="flex flex-col gap-4 p-4">
          <div
            className="halo-card halo-breathe rounded-3xl p-5"
            style={{ "--glow": (cat?.color ?? "#ff2e63") + "66", "--int": 0.6 } as React.CSSProperties}
          >
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: cat?.color }}>
              {cat?.emoji} {cat?.label[locale]} · {fr ? "géré par toi" : "managed by you"}
            </p>
            <p className="font-display mt-1 text-2xl font-extrabold">{partner.place?.name}</p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Stat n={String(stats?.active_now ?? 0)} label={fr ? "ici maintenant" : "here now"} accent />
              <Stat n={String(stats?.checkins_30d ?? 0)} label={fr ? "visites 30 j" : "visits 30d"} />
              <Stat n={stats?.peak_hour != null ? `${stats.peak_hour} h` : "—"} label={fr ? "heure de pointe" : "peak hour"} />
            </div>
          </div>

          {/* créer un événement */}
          <div className="rounded-3xl border border-border bg-surface p-4">
            <p className="font-display text-base font-bold">📅 {fr ? "Publier un événement" : "Post an event"}</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={fr ? "Titre (ex: Soirée Jazz Manouche)" : "Title"}
              maxLength={120}
              className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-brand"
            />
            <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
              {SEGMENTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSegment(s.key)}
                  className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold"
                  style={{
                    borderColor: segment === s.key ? "var(--brand)" : "var(--border)",
                    color: segment === s.key ? "var(--brand)" : "var(--text-dim)",
                  }}
                >
                  {s.emoji} {fr ? s.fr : s.en}
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex gap-2">
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-brand"
                style={{ colorScheme: "dark" }}
              />
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder={fr ? "Prix $" : "Price $"}
                className="w-24 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
            </div>
            <input
              value={ticketUrl}
              onChange={(e) => setTicketUrl(e.target.value)}
              placeholder={fr ? "Lien billets https:// (optionnel)" : "Tickets link https:// (optional)"}
              className="mt-2.5 w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={doCreate}
              disabled={busy || !title.trim() || !when}
              className="glow-cta brand-gradient pressable mt-3 w-full rounded-full py-3 font-display text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "…" : fr ? "Publier 🚀" : "Publish 🚀"}
            </button>
          </div>

          {/* mes événements */}
          {events.length > 0 && (
            <div className="rounded-3xl border border-border bg-surface p-4">
              <p className="font-display text-base font-bold">🗓 {fr ? "Tes événements" : "Your events"}</p>
              <div className="mt-3 flex flex-col gap-2.5">
                {events.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{e.title}</p>
                      <p className="text-xs text-text-dim">
                        {new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", {
                          weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                        }).format(new Date(e.starts_at))}
                        {e.price_min != null ? ` · ${e.price_min} $` : ""}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        await deletePartnerEvent(e.id);
                        load();
                      }}
                      className="text-xs text-text-dim"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, accent }: { n: string; label: string; accent?: boolean }) {
  return (
    <div>
      <p className="font-display text-xl font-extrabold" style={{ color: accent ? "var(--accent)" : "var(--text)" }}>
        {n}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-text-dim">{label}</p>
    </div>
  );
}
