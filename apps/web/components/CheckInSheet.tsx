"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCategory, timeAgo, type CheckIn, type NearbyPlace } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  checkIn,
  claimDrop,
  createReservation,
  fetchCheckIns,
  fetchPlaceDrop,
  fetchPlaceForecast,
  fetchPlaceMemory,
  fetchPlacePartnerUser,
  leaveCheckIn,
  type PlaceDrop,
  type PlaceForecast,
  type PlaceMemory,
} from "@/lib/data";
import { pushNotify } from "@/lib/push";
import { renderShareCard, shareImage } from "@/lib/sharecard";
import { findSpotifyLink, SpotifyEmbed } from "@/lib/spotify";
import { Avatar } from "./Avatar";
import { MessageButton } from "./MessageButton";

export function CheckInSheet({
  place,
  onClose,
  onChanged,
}: {
  place: NearbyPlace;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, locale } = useT();
  const { profile } = useAuth();
  const [list, setList] = useState<CheckIn[]>([]);
  const [message, setMessage] = useState("");
  const [spotify, setSpotify] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [memory, setMemory] = useState<PlaceMemory | null>(null);
  const [forecast, setForecast] = useState<PlaceForecast | null>(null);
  const [drop, setDrop] = useState<PlaceDrop | null>(null);
  const [dropToast, setDropToast] = useState<string | null>(null);
  // réservation 🍽️
  const [booking, setBooking] = useState(false);
  const [bookWhen, setBookWhen] = useState("");
  const [bookSize, setBookSize] = useState(2);
  const [bookNote, setBookNote] = useState("");
  const [bookDone, setBookDone] = useState(false);
  const cat = getCategory(place.category);
  const bookable = place.category === "restaurant" || place.category === "cafe";

  const mine = profile ? list.find((c) => c.user_id === profile.id) : undefined;

  async function load() {
    setLoading(true);
    try {
      setList(await fetchCheckIns(place.id));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    fetchPlaceMemory(place.id).then(setMemory).catch(() => {});
    fetchPlaceForecast(place.id).then(setForecast).catch(() => {});
    if (profile) fetchPlaceDrop(place.id, profile.id).then(setDrop).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id]);

  async function doCheckIn() {
    if (!profile) return;
    setBusy(true);
    try {
      await checkIn(
        profile.id,
        place.id,
        message.trim() || null,
        place.lat,
        place.lng,
        findSpotifyLink(spotify)
      );
      setMessage("");
      setSpotify("");
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // « ce qui joue ici » : le lien Spotify le plus récent parmi les présents
  const nowPlaying = list.find((c) => c.spotify_url)?.spotify_url ?? null;

  async function doBook() {
    if (!profile || !bookWhen) return;
    setBusy(true);
    try {
      await createReservation(profile.id, place.id, new Date(bookWhen).toISOString(), bookSize, bookNote.trim() || null);
      // push au restaurateur s'il gère son lieu sur Whozin
      const partnerId = await fetchPlacePartnerUser(place.id);
      if (partnerId) {
        pushNotify(partnerId, {
          title: `🍽️ ${place.name}`,
          body: `${profile.display_name || profile.username} · ${bookSize} pers. · ${new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(bookWhen))}`,
          url: "/partner",
          tag: "resa",
        });
      }
      setBookDone(true);
      setTimeout(() => {
        setBooking(false);
        setBookDone(false);
        setBookWhen("");
        setBookNote("");
      }, 2200);
    } finally {
      setBusy(false);
    }
  }

  async function doLeave() {
    if (!mine) return;
    setBusy(true);
    try {
      await leaveCheckIn(mine.id);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade" onClick={onClose} />
      <div className="relative flex max-h-[80dvh] w-full max-w-[480px] flex-col rounded-t-3xl border-t border-border bg-surface animate-slide-up">
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border" />

        <div className="flex items-start gap-3 p-5 pb-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
            style={{ background: cat.color + "33" }}
          >
            {cat.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{place.name}</h2>
            <p className="text-sm text-text-dim">
              <span style={{ color: cat.color }}>{cat.label[locale]}</span>
              {place.address ? ` · ${place.address}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-accent">
            {place.active_checkins} {t.checkin.peopleHere}
          </span>
        </div>

        {/* 🎶 ce qui joue ici */}
        {nowPlaying && (
          <div className="mx-5 mb-1">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-text-dim">
              <span className="live-dot" style={{ width: 5, height: 5 }} /> 🎶{" "}
              {locale === "fr" ? "Ce qui joue ici" : "Playing here"}
            </p>
            <SpotifyEmbed url={nowPlaying} height={80} />
          </div>
        )}

        {/* drop géolocalisé 🎁 */}
        {drop && (
          <div
            className="halo-card mx-5 mb-1 flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
            style={{ "--glow": "rgba(255,201,77,.5)", "--int": 0.65 } as React.CSSProperties}
          >
            <span className="text-2xl">{drop.emoji}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm font-bold">{drop.name}</p>
              <p className="text-[11px] text-text-dim">
                {drop.kind === "ring_skin"
                  ? locale === "fr" ? "Skin d'anneau exclusif" : "Exclusive ring skin"
                  : locale === "fr" ? "Badge à collectionner" : "Collectible badge"}
              </p>
            </div>
            {drop.claimed ? (
              <span className="text-xs font-bold text-accent">✓ {locale === "fr" ? "Obtenu" : "Claimed"}</span>
            ) : mine ? (
              <button
                onClick={async () => {
                  try {
                    const r = await claimDrop(drop.id);
                    setDrop({ ...drop, claimed: true });
                    setDropToast(`${r.emoji} ${r.name} — ${locale === "fr" ? "à toi!" : "yours!"}`);
                    setTimeout(() => setDropToast(null), 2800);
                  } catch {
                    /* pas sur place */
                  }
                }}
                className="glow-cta brand-gradient pressable shrink-0 rounded-full px-3.5 py-2 text-xs font-bold text-white"
              >
                {locale === "fr" ? "Réclamer 🎁" : "Claim 🎁"}
              </button>
            ) : (
              <span className="text-[11px] text-text-dim">
                {locale === "fr" ? "Check-in pour débloquer" : "Check in to unlock"}
              </span>
            )}
          </div>
        )}
        {dropToast && (
          <div className="glass fixed left-1/2 top-[max(14px,env(safe-area-inset-top))] z-[95] -translate-x-1/2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-bold animate-glow-enter">
            {dropToast}
          </div>
        )}

        {/* prédiction d'affluence 🔮 */}
        {forecast && (
          <div className="mx-5 mb-1 flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: "rgba(255,201,77,.1)", border: "1px solid rgba(255,201,77,.3)" }}>
            <span className="text-xl">🔮</span>
            <p className="text-[13px] leading-snug" style={{ color: "var(--gold)" }}>
              {locale === "fr"
                ? <>Devrait être plein vers <b>{forecast.peak_hour} h</b> ({forecast.confidence} %)</>
                : <>Should be packed around <b>{forecast.peak_hour}:00</b> ({forecast.confidence}%)</>}
            </p>
          </div>
        )}

        {/* souvenir de lieu 📸 */}
        {memory && (
          <div className="mx-5 mb-1 flex items-center gap-3 rounded-2xl border border-border bg-surface-2 px-3.5 py-2.5 animate-glow-enter">
            <span className="text-xl">📸</span>
            <p className="text-[13px] leading-snug text-text-dim">
              {locale === "fr" ? "Ta dernière fois ici : " : "Your last time here: "}
              <b className="text-text">{timeAgo(memory.last_at, locale)}</b>
              {memory.with_names.length > 0 && (
                <>
                  {" "}
                  {locale === "fr" ? "avec" : "with"}{" "}
                  <b className="text-accent">{memory.with_names.slice(0, 3).join(", ")}</b>
                </>
              )}
            </p>
          </div>
        )}

        {/* liste des présents */}
        <div className="flex-1 overflow-y-auto px-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-dim">
            {t.map.whoIsHere}
          </p>
          {loading ? (
            <p className="py-6 text-center text-sm text-text-dim">{t.common.loading}</p>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-dim">{t.map.nobodyYet}</p>
          ) : (
            <ul className="flex flex-col gap-3 pb-2">
              {list.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <Link href={`/u/${c.author?.username ?? ""}`}>
                    <Avatar profile={c.author} size={38} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {c.author?.display_name || c.author?.username}
                      <span className="ml-2 text-xs font-normal text-text-dim">
                        {timeAgo(c.created_at, locale)}
                      </span>
                    </p>
                    {c.message && <p className="truncate text-sm text-text-dim">{c.message}</p>}
                  </div>
                  <MessageButton
                    targetUserId={c.user_id}
                    variant="icon"
                    context={{ place: place.name, cat: place.category }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* action check-in */}
        <div className="border-t border-border p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          {bookable && (
            <button
              onClick={() => setBooking(true)}
              className="pressable mb-2.5 flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-bold"
              style={{ borderColor: cat.color + "66", color: cat.color, background: cat.color + "14" }}
            >
              🍽️ {locale === "fr" ? "Réserver une table" : "Book a table"}
            </button>
          )}
          {mine ? (
            <div className="flex gap-2">
              <button
                onClick={doLeave}
                disabled={busy}
                className="flex-1 rounded-xl border border-border py-3 font-semibold text-text-dim"
              >
                {t.checkin.leave}
              </button>
              <button
                onClick={async () => {
                  const blob = await renderShareCard({
                    title: place.name,
                    subtitle: locale === "fr" ? "J'y suis. Who's in? 👀" : "I'm here. Who's in? 👀",
                    emoji: cat.emoji,
                    accent: cat.color,
                  });
                  await shareImage(blob, "whozin-sortie.png", `${place.name} — Whozin`);
                }}
                className="glow-cta brand-gradient pressable flex-1 rounded-xl py-3 font-bold text-white"
              >
                📤 {locale === "fr" ? "Partager" : "Share"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t.checkin.placeholder}
                maxLength={200}
                className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-base outline-none focus:border-brand"
              />
              <input
                value={spotify}
                onChange={(e) => setSpotify(e.target.value)}
                placeholder={locale === "fr" ? "🎶 Lien Spotify — ce qui joue (optionnel)" : "🎶 Spotify link — what's playing (optional)"}
                className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={doCheckIn}
                disabled={busy}
                className="brand-gradient rounded-xl py-3 font-bold text-white disabled:opacity-60"
              >
                {busy ? t.common.loading : `📍 ${t.checkin.cta}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* sous-panneau réservation 🍽️ */}
      {booking && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 animate-fade" onClick={() => setBooking(false)} />
          <div className="relative w-full max-w-[480px] rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] animate-slide-up">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            {bookDone ? (
              <div className="py-8 text-center">
                <p className="text-4xl">✅</p>
                <p className="font-display mt-2 text-lg font-bold">
                  {locale === "fr" ? "Demande envoyée!" : "Request sent!"}
                </p>
                <p className="mt-1 text-sm text-text-dim">
                  {locale === "fr" ? "Tu recevras une notification à la confirmation." : "You'll get notified on confirmation."}
                </p>
              </div>
            ) : (
              <>
                <h2 className="font-display text-lg font-bold">🍽️ {place.name}</h2>
                <input
                  type="datetime-local"
                  value={bookWhen}
                  onChange={(e) => setBookWhen(e.target.value)}
                  className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm outline-none focus:border-brand"
                  style={{ colorScheme: "dark" }}
                />
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm text-text-dim">{locale === "fr" ? "Pour" : "For"}</span>
                  {[2, 4, 6, 8].map((n) => (
                    <button
                      key={n}
                      onClick={() => setBookSize(n)}
                      className="h-10 w-10 rounded-full border text-sm font-bold"
                      style={{
                        borderColor: bookSize === n ? "var(--accent)" : "var(--border)",
                        color: bookSize === n ? "var(--accent)" : "var(--text-dim)",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <input
                  value={bookNote}
                  onChange={(e) => setBookNote(e.target.value)}
                  maxLength={200}
                  placeholder={locale === "fr" ? "Note (allergies, terrasse…)" : "Note (allergies, patio…)"}
                  className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm outline-none focus:border-brand"
                />
                <button
                  onClick={doBook}
                  disabled={busy || !bookWhen}
                  className="glow-cta brand-gradient pressable mt-4 w-full rounded-full py-3.5 font-display text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? "…" : locale === "fr" ? "Envoyer la demande" : "Send request"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
