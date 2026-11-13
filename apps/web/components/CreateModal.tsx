"use client";

import { useEffect, useRef, useState } from "react";
import { MONTREAL, estTexteInterdit, getCategory, type NearbyPlace, type Visibility } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { createPost, fetchNearby, removeMedia, uploadMedia } from "@/lib/data";

export function CreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { t } = useT();
  const { profile } = useAuth();
  const [body, setBody] = useState("");
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setBody("");
    setPlaceId(null);
    setErr(null);
    setFile(null);
    setPreview(null);
    const center = (() => {
      try {
        const raw = localStorage.getItem("wi.lastCenter");
        return raw ? (JSON.parse(raw) as { lat: number; lng: number }) : MONTREAL;
      } catch {
        return MONTREAL;
      }
    })();
    fetchNearby(center.lat, center.lng).then(setPlaces).catch(() => {});
  }, [open]);

  if (!open) return null;

  const selected = places.find((p) => p.id === placeId);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function publish() {
    if (!profile) return;
    if (!body.trim() && !file) {
      setErr(t.create.whatsHappening);
      return;
    }
    setBusy(true);
    setErr(null);
    let photoUrl: string | null = null;
    try {
      if (file) photoUrl = await uploadMedia(file, profile.id);
      await createPost(
        profile.id,
        body.trim(),
        placeId,
        visibility,
        selected?.lat ?? null,
        selected?.lng ?? null,
        photoUrl,
        file?.type.startsWith("video/") ? "video" : "image"
      );
    } catch (e) {
      // refusée après le dépôt : la photo ne reste pas en ligne dans le bucket public
      if (photoUrl) removeMedia(photoUrl);
      setErr(estTexteInterdit(e) ? t.common.forbiddenWord : e instanceof Error ? e.message : t.common.error);
      return;
    } finally {
      setBusy(false);
    }
    onCreated?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[480px] rounded-t-3xl border-t border-border bg-surface p-5 pb-8 animate-slide-up">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <h2 className="mb-3 text-lg font-bold">{t.create.title}</h2>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.create.whatsHappening}
          rows={3}
          maxLength={1000}
          autoFocus
          className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-3 text-base outline-none focus:border-brand"
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {preview ? (
          <div className="relative mt-3">
            {file?.type.startsWith("video/") ? (
              <video src={preview} autoPlay muted loop playsInline className="max-h-64 w-full rounded-xl object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="max-h-64 w-full rounded-xl object-cover" />
            )}
            <button
              onClick={() => pickFile(null)}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-text-dim"
          >
            📷 {t.create.addPhoto}
          </button>
        )}

        <p className="mb-2 mt-4 text-xs font-medium text-text-dim">{t.create.selectPlace}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {places.slice(0, 12).map((p) => {
            const cat = getCategory(p.category);
            const active = p.id === placeId;
            return (
              <button
                key={p.id}
                onClick={() => setPlaceId(active ? null : p.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm"
                style={{
                  borderColor: active ? cat.color : "var(--border)",
                  background: active ? cat.color + "22" : "var(--surface-2)",
                }}
              >
                <span>{cat.emoji}</span>
                <span className="max-w-[120px] truncate">{p.name}</span>
              </button>
            );
          })}
          {places.length === 0 && (
            <span className="py-2 text-sm text-text-dim">{t.common.loading}</span>
          )}
        </div>

        <p className="mb-2 mt-4 text-xs font-medium text-text-dim">{t.create.visibility}</p>
        <div className="flex gap-2">
          {(["public", "friends", "private"] as Visibility[]).map((v) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className="flex-1 rounded-xl border py-2 text-sm font-semibold"
              style={{
                borderColor: visibility === v ? "var(--brand)" : "var(--border)",
                color: visibility === v ? "var(--brand)" : "var(--text-dim)",
              }}
            >
              {t.visibility[v]}
            </button>
          ))}
        </div>

        {err && (
          <p role="alert" className="mt-3 text-sm text-brand-2">
            {err}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-3 font-semibold text-text-dim"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={publish}
            disabled={busy}
            className="brand-gradient flex-[2] rounded-xl py-3 font-bold text-white disabled:opacity-60"
          >
            {busy ? t.common.loading : t.create.publish}
          </button>
        </div>
      </div>
    </div>
  );
}
