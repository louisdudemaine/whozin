"use client";

import { useCallback, useEffect, useState } from "react";
import type { Profile } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import {
  fetchMutuals,
  fetchMyGuardian,
  fetchMyProteges,
  guardianHome,
  guardianStart,
  type GuardianInfo,
  type Protege,
} from "@/lib/data";
import { pushNotify } from "@/lib/push";
import { timeAgo } from "@whosin/shared";
import { Avatar } from "./Avatar";

/** 🛡️ Ange gardien — carte de gestion (page Sécurité). */
export function GuardianCard() {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const [guardian, setGuardian] = useState<GuardianInfo | null>(null);
  const [mutuals, setMutuals] = useState<Profile[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [hours, setHours] = useState(8);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const g = await fetchMyGuardian();
    setGuardian(g);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (profile) fetchMutuals(profile.id).then(setMutuals);
  }, [load, profile]);

  async function start() {
    if (!picked) return;
    setBusy(true);
    setMsg(null);
    try {
      const g = await guardianStart(picked, hours);
      setGuardian(g);
      pushNotify(g.guardian_id, {
        title: fr ? "🛡️ On compte sur toi" : "🛡️ They're counting on you",
        body: fr
          ? `${profile?.display_name || profile?.username} te confie sa soirée (${hours}h). Tu verras ses spots.`
          : `${profile?.display_name || profile?.username} trusts you with their night (${hours}h).`,
        url: "/feed",
        tag: "guardian",
      });
      setMsg(fr ? "🛡️ Veille activée." : "🛡️ Watch is on.");
    } catch {
      setMsg(fr ? "Oups — vérifie le nom d'utilisateur." : "Oops — check the username.");
    } finally {
      setBusy(false);
    }
  }

  async function home() {
    setBusy(true);
    try {
      const gid = await guardianHome();
      if (gid) {
        pushNotify(gid, {
          title: fr ? "🏠 Bien rentré·e" : "🏠 Home safe",
          body: fr
            ? `${profile?.display_name || profile?.username} est rentré·e en sécurité. Bonne nuit!`
            : `${profile?.display_name || profile?.username} made it home safe. Good night!`,
          tag: "guardian",
        });
      }
      setGuardian(null);
      setMsg(fr ? "🏠 Bonne nuit — ton gardien a été prévenu." : "🏠 Good night — your guardian was told.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-base font-bold">🛡️ {fr ? "Ange gardien" : "Guardian angel"}</p>
          <p className="mt-0.5 text-xs text-text-dim">
            {fr
              ? "Un·e ami·e suit tes spots de la soirée et sait quand tu rentres."
              : "A friend follows your night's spots and knows when you're home."}
          </p>
        </div>
        {guardian && (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: "rgba(61,220,132,.15)", color: "#3ddc84" }}
          >
            ✓ {fr ? "Actif" : "On"}
          </span>
        )}
      </div>

      {loading ? null : guardian ? (
        <div className="mt-4">
          <div className="glass flex items-center gap-3 rounded-2xl p-3">
            <span className="ring">
              <Avatar
                profile={{ username: guardian.username, display_name: guardian.display_name, avatar_url: guardian.avatar_url }}
                size={40}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{guardian.display_name || guardian.username}</p>
              <p className="text-[11px] text-text-dim">
                {fr ? "veille sur toi jusqu'à" : "watching over you until"}{" "}
                {new Date(guardian.active_until).toLocaleTimeString(fr ? "fr-CA" : "en-CA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <button
            onClick={home}
            disabled={busy}
            className="glow-cta brand-gradient pressable mt-3 w-full rounded-full py-3.5 font-display text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? "…" : fr ? "Je suis rentré·e 🏠" : "I'm home 🏠"}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          {mutuals.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-text-dim">
              {fr
                ? "Suis des amis (qui te suivent aussi) pour pouvoir leur confier ta soirée."
                : "Follow friends (who follow you back) to trust them with your night."}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {mutuals.slice(0, 6).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPicked(m.username)}
                    className="pressable flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5"
                    style={{
                      borderColor: picked === m.username ? "var(--brand)" : "var(--border)",
                      background: picked === m.username ? "rgba(255,46,99,.1)" : "var(--surface-2)",
                    }}
                  >
                    <Avatar profile={m} size={26} />
                    <span className="text-sm font-bold">{m.display_name || m.username}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                {[4, 8, 12].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHours(h)}
                    className="flex-1 rounded-xl border py-2 text-sm font-bold"
                    style={{
                      borderColor: hours === h ? "var(--brand)" : "var(--border)",
                      color: hours === h ? "var(--brand)" : "var(--text-dim)",
                    }}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              <button
                onClick={start}
                disabled={busy || !picked}
                className="brand-gradient pressable mt-3 w-full rounded-full py-3 font-display text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "…" : fr ? "Activer la veille 🛡️" : "Start the watch 🛡️"}
              </button>
            </>
          )}
        </div>
      )}

      {msg && <p className="mt-3 text-center text-sm font-semibold text-brand-2">{msg}</p>}
    </div>
  );
}

/** Strips du feed : « X veille sur toi » (protégé) + « tu veilles sur X » (gardien). */
export function GuardianStrips() {
  const { locale } = useT();
  const fr = locale === "fr";
  const [guardian, setGuardian] = useState<GuardianInfo | null>(null);
  const [proteges, setProteges] = useState<Protege[]>([]);
  const [busy, setBusy] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    fetchMyGuardian().then(setGuardian);
    fetchMyProteges().then(setProteges);
  }, []);

  async function home() {
    setBusy(true);
    try {
      const gid = await guardianHome();
      if (gid) {
        pushNotify(gid, {
          title: fr ? "🏠 Bien rentré·e" : "🏠 Home safe",
          body: fr
            ? `${profile?.display_name || profile?.username} est rentré·e en sécurité.`
            : `${profile?.display_name || profile?.username} made it home safe.`,
          tag: "guardian",
        });
      }
      setGuardian(null);
    } finally {
      setBusy(false);
    }
  }

  if (!guardian && proteges.length === 0) return null;

  return (
    <div className="mx-3 mt-3 flex flex-col gap-2">
      {guardian && (
        <div
          className="halo-card flex items-center justify-between rounded-2xl px-4 py-2.5"
          style={{ "--glow": "rgba(61,220,132,.4)", "--int": 0.55 } as React.CSSProperties}
        >
          <span className="flex items-center gap-2 text-[13px] font-bold">
            🛡️ {(guardian.display_name || guardian.username) + (fr ? " veille sur toi" : " is watching over you")}
          </span>
          <button
            onClick={home}
            disabled={busy}
            className="rounded-full px-3 py-1.5 text-xs font-bold"
            style={{ background: "rgba(61,220,132,.15)", color: "#3ddc84" }}
          >
            {fr ? "Rentré·e 🏠" : "Home 🏠"}
          </button>
        </div>
      )}
      {proteges.map((p) => (
        <div
          key={p.user_id}
          className="halo-card flex items-center gap-3 rounded-2xl px-4 py-2.5"
          style={{ "--glow": "rgba(77,159,255,.4)", "--int": 0.55 } as React.CSSProperties}
        >
          <span className="ring">
            <Avatar
              profile={{ username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }}
              size={30}
            />
          </span>
          <span className="min-w-0 flex-1 text-[13px]">
            <b>{fr ? `Tu veilles sur ${p.display_name || p.username}` : `You're watching ${p.display_name || p.username}`}</b>
            <span className="block truncate text-[11px] text-text-dim">
              {p.last_place
                ? `${fr ? "Dernier spot" : "Last spot"}: ${p.last_place}${p.last_seen ? ` · ${timeAgo(p.last_seen, locale)}` : ""}`
                : fr
                  ? "Aucun spot pour l'instant"
                  : "No spot yet"}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
