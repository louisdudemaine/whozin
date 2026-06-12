"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-[var(--header)] px-4 py-3 backdrop-blur-xl pt-[max(12px,env(safe-area-inset-top))]">
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

        <DataCard fr={fr} />

        <div className="mt-4 rounded-3xl border border-border bg-surface p-5 text-sm text-text-dim">
          <p className="font-bold text-text">🛡️ {fr ? "Déjà en place" : "Already in place"}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            <li>✓ {fr ? "Messages chiffrés au repos (AES-256) et en transit (TLS)" : "Messages encrypted at rest (AES-256) and in transit (TLS)"}</li>
            <li>✓ {fr ? "Position exacte jamais exposée (paliers seulement)" : "Exact location never exposed (buckets only)"}</li>
            <li>✓ {fr ? "Blocage appliqué au niveau base de données" : "Blocks enforced at the database level"}</li>
            <li>→ {fr ? "FaceID/empreinte et SMS : avec l'app native (bientôt)" : "FaceID/fingerprint & SMS: with the native app (soon)"}</li>
          </ul>
          <Link href="/confidentialite" className="mt-3 block text-[13px] font-bold text-brand-2">
            📜 {fr ? "Politique de confidentialité (Loi 25)" : "Privacy policy (Law 25)"} →
          </Link>
        </div>
      </div>
    </div>
  );
}

/** 📦 Mes données — portabilité (export JSON) + droit à l'oubli (Loi 25). */
function DataCard({ fr }: { fr: boolean }) {
  const supabase = getSupabase();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function exportData() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("export_my_data");
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mes-donnees-whozin.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function eraseAccount() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("erase_my_account");
      if (error) throw error;
      await supabase.auth.signOut();
      router.replace("/");
    } catch {
      setBusy(false);
    }
  }

  const word = fr ? "SUPPRIMER" : "DELETE";

  return (
    <div className="mt-4 rounded-3xl border border-border bg-surface p-5">
      <p className="font-display text-base font-bold">📦 {fr ? "Mes données" : "My data"}</p>
      <p className="mt-0.5 text-xs text-text-dim">
        {fr
          ? "Tes droits Loi 25, en libre-service — sans formulaire, sans attente."
          : "Your Law 25 rights, self-serve — no forms, no waiting."}
      </p>
      <button
        onClick={exportData}
        disabled={busy}
        className="pressable mt-4 w-full rounded-full border border-border py-3 text-sm font-bold disabled:opacity-50"
      >
        ⬇️ {fr ? "Exporter toutes mes données (JSON)" : "Export all my data (JSON)"}
      </button>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-2.5 w-full rounded-full py-2.5 text-sm font-semibold"
          style={{ color: "var(--brand)" }}
        >
          🗑 {fr ? "Supprimer mon compte" : "Delete my account"}
        </button>
      ) : (
        <div className="mt-3 rounded-2xl border p-3.5" style={{ borderColor: "rgba(255,46,99,.4)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--brand)" }}>
            {fr ? "Irréversible." : "Irreversible."}
          </p>
          <p className="mt-1 text-xs text-text-dim">
            {fr
              ? `Compte, check-ins, messages, photos : tout part, immédiatement. Écris ${word} pour confirmer.`
              : `Account, check-ins, messages, photos: everything goes, immediately. Type ${word} to confirm.`}
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder={word}
            className="mt-2.5 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-center text-sm font-bold tracking-widest outline-none focus:border-brand"
          />
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => {
                setConfirming(false);
                setConfirmText("");
              }}
              className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold text-text-dim"
            >
              {fr ? "Annuler" : "Cancel"}
            </button>
            <button
              onClick={eraseAccount}
              disabled={busy || confirmText !== word}
              className="flex-1 rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: "var(--brand)" }}
            >
              {busy ? "…" : fr ? "Tout effacer" : "Erase everything"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
