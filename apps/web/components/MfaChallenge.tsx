"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/locale";
import { getSupabase } from "@/lib/supabase";

/**
 * Barrière 2FA à la connexion : si un facteur TOTP vérifié existe,
 * la session reste aal1 tant que le code n'est pas fourni.
 */
export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const { locale } = useT();
  const fr = locale === "fr";
  const supabase = getSupabase();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const f = (data?.totp ?? []).find((x) => x.status === "verified");
      setFactorId(f?.id ?? null);
    });
  }, [supabase]);

  async function verify() {
    if (!factorId || code.length < 6) return;
    setBusy(true);
    setErr(null);
    try {
      const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId });
      if (e1) throw e1;
      const { error: e2 } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code,
      });
      if (e2) throw e2;
      onDone();
    } catch {
      setErr(fr ? "Code invalide — réessaie." : "Invalid code — try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-8 text-center">
      <div className="neon-rain neon-rain--intense absolute inset-0 -z-10" aria-hidden />
      <span className="glass flex h-16 w-16 items-center justify-center rounded-3xl text-3xl animate-glow-enter">
        🔐
      </span>
      <h1 className="font-display mt-5 text-2xl font-extrabold">
        {fr ? "Vérification en deux étapes" : "Two-step verification"}
      </h1>
      <p className="mt-1.5 text-sm text-text-dim">
        {fr ? "Entre le code de ton app d'authentification." : "Enter the code from your authenticator app."}
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => e.key === "Enter" && verify()}
        inputMode="numeric"
        autoFocus
        placeholder="••••••"
        className="mt-6 w-48 rounded-2xl border border-border bg-surface px-3 py-4 text-center font-display text-2xl tracking-[0.3em] outline-none focus:border-brand"
      />
      {err && <p className="mt-2 text-sm text-brand-2">{err}</p>}
      <button
        onClick={verify}
        disabled={busy || code.length < 6 || !factorId}
        className="glow-cta brand-gradient pressable mt-5 w-full max-w-xs rounded-full py-3.5 font-display text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? "…" : fr ? "Déverrouiller" : "Unlock"}
      </button>
      <button
        onClick={() => getSupabase().auth.signOut()}
        className="mt-4 text-sm text-text-dim"
      >
        {fr ? "Se déconnecter" : "Sign out"}
      </button>
    </div>
  );
}
