"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCategory, timeAgo, type CheckIn, type NearbyPlace } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { checkIn, fetchCheckIns, leaveCheckIn } from "@/lib/data";
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
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const cat = getCategory(place.category);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id]);

  async function doCheckIn() {
    if (!profile) return;
    setBusy(true);
    try {
      await checkIn(profile.id, place.id, message.trim() || null, place.lat, place.lng);
      setMessage("");
      await load();
      onChanged();
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
                  <MessageButton targetUserId={c.user_id} variant="icon" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* action check-in */}
        <div className="border-t border-border p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          {mine ? (
            <button
              onClick={doLeave}
              disabled={busy}
              className="w-full rounded-xl border border-border py-3 font-semibold text-text-dim"
            >
              {t.checkin.leave}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t.checkin.placeholder}
                maxLength={200}
                className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-base outline-none focus:border-brand"
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
    </div>
  );
}
