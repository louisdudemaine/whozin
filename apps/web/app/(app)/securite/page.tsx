"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";
import { GuardianCard } from "@/components/Guardian";

type Factor = { id: string; friendly_name?: string | null; status: string };

/** 🔐 Sécurité — 2FA TOTP (Google Authenticator, Authy, 1Password…). */
export default function SecurityPage() {
  const { locale } = useT();
  const fr = locale === "fr";
  const supabase = getSupabase();

  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  // enrôlement en cours
  const [enrollId, setEnrollId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    // data.all inclut aussi les enrôlements abandonnés (non vérifiés)
    const all = (data?.all ?? []).filter((f) => f.factor_type === "totp");
    setFactors(all as Factor[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const active = factors.find((f) => f.status === "verified");

  async function startEnroll() {
    setBusy(true);
    setMsg(null);
    try {
      // nettoie les enrôlements abandonnés
      for (const f of factors.filter((x) => x.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Whozin 2FA",
      });
      if (error) throw error;
      setEnrollId(data.id);
      setQrSvg(data.totp.qr_code); // SVG généré par Supabase — le secret ne sort jamais
      setSecret(data.totp.secret);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!enrollId || code.length < 6) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: enrollId });
      if (e1) throw e1;
      const { error: e2 } = await supabase.auth.mfa.verify({
        factorId: enrollId,
        challengeId: ch.id,
        code,
      });
      if (e2) throw e2;
      setEnrollId(null);
      setQrSvg(null);
      setSecret(null);
      setCode("");
      setMsg(fr ? "✅ 2FA activé — ton compte est blindé." : "✅ 2FA enabled — your account is locked down.");
      await load();
    } catch {
      setMsg(fr ? "Code invalide — réessaie." : "Invalid code — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!active) return;
    setBusy(true);
    try {
      await supabase.auth.mfa.unenroll({ factorId: active.id });
      setMsg(fr ? "2FA désactivé." : "2FA disabled.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-[rgba(7,7,13,0.72)] px-4 py-3 backdrop-blur-xl pt-[max(12px,env(safe-area-inset-top))]">
        <Link href="/profile" className="text-text-dim">←</Link>
        <h1 className="font-display text-xl font-extrabold">🔐 {fr ? "Sécurité" : "Security"}</h1>
      </header>

      <div className="p-4">
        <div className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-base font-bold">
                {fr ? "Authentification à deux facteurs" : "Two-factor authentication"}
              </p>
              <p className="mt-0.5 text-xs text-text-dim">
                {fr ? "Google Authenticator, Authy, 1Password…" : "Google Authenticator, Authy, 1Password…"}
              </p>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{
                background: active ? "rgba(61,220,132,.15)" : "var(--surface-2)",
                color: active ? "#3ddc84" : "var(--text-dim)",
              }}
            >
              {loading ? "…" : active ? (fr ? "✓ Activé" : "✓ On") : (fr ? "Désactivé" : "Off")}
            </span>
          </div>

          {!loading && !active && !enrollId && (
            <button
              onClick={startEnroll}
              disabled={busy}
              className="glow-cta brand-gradient pressable mt-4 w-full rounded-full py-3.5 font-display text-sm font-bold text-white disabled:opacity-60"
            >
              {busy ? "…" : fr ? "Activer le 2FA 🔐" : "Enable 2FA 🔐"}
            </button>
          )}

          {enrollId && qrSvg && (
            <div className="mt-4 text-center">
              <p className="text-sm text-text-dim">
                {fr ? "1. Scanne ce code avec ton app d'authentification" : "1. Scan with your authenticator app"}
              </p>
              <div
                className="mx-auto mt-3 inline-block rounded-2xl bg-white p-3 [&>svg]:h-44 [&>svg]:w-44"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              {secret && (
                <p className="mt-2 break-all rounded-xl bg-surface-2 px-3 py-2 text-[11px] text-text-dim">
                  {fr ? "Ou entre la clé : " : "Or enter key: "}
                  <b className="text-text">{secret}</b>
                </p>
              )}
              <p className="mt-3 text-sm text-text-dim">
                {fr ? "2. Entre le code à 6 chiffres" : "2. Enter the 6-digit code"}
              </p>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="••••••"
                className="mt-2 w-40 rounded-xl border border-border bg-surface-2 px-3 py-3 text-center font-display text-xl tracking-[0.3em] outline-none focus:border-brand"
              />
              <button
                onClick={confirmEnroll}
                disabled={busy || code.length < 6}
                className="brand-gradient pressable mt-3 block w-full rounded-full py-3 font-display text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "…" : fr ? "Confirmer" : "Confirm"}
              </button>
            </div>
          )}

          {active && (
            <button
              onClick={disable}
              disabled={busy}
              className="mt-4 w-full rounded-full border border-border py-3 text-sm font-semibold text-text-dim"
            >
              {fr ? "Désactiver le 2FA" : "Disable 2FA"}
            </button>
          )}

          {msg && <p className="mt-3 text-center text-sm font-semibold text-brand-2">{msg}</p>}
        </div>

        <GuardianCard />

        <div className="mt-4 rounded-3xl border border-border bg-surface p-5 text-sm text-text-dim">
          <p className="font-bold text-text">🛡️ {fr ? "Déjà en place" : "Already in place"}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            <li>✓ {fr ? "Messages chiffrés au repos (AES-256) et en transit (TLS)" : "Messages encrypted at rest (AES-256) and in transit (TLS)"}</li>
            <li>✓ {fr ? "Position exacte jamais exposée (paliers seulement)" : "Exact location never exposed (buckets only)"}</li>
            <li>✓ {fr ? "Blocage appliqué au niveau base de données" : "Blocks enforced at the database level"}</li>
            <li>→ {fr ? "FaceID/empreinte et SMS : avec l'app native (bientôt)" : "FaceID/fingerprint & SMS: with the native app (soon)"}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
