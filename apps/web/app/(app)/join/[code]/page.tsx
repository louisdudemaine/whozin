"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { joinSquad, squadInvitePreview, type SquadPreview } from "@/lib/data";

/** Atterrissage d'un lien d'invitation squad : aperçu, puis on ne rejoint qu'après confirmation. */
export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [preview, setPreview] = useState<SquadPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fr = locale === "fr";
  const invalid = fr ? "Invitation invalide ou expirée." : "Invalid or expired invite.";

  useEffect(() => {
    if (!profile) return;
    squadInvitePreview(code)
      .then((p) => (p ? setPreview(p) : setError(invalid)))
      .catch(() => setError(invalid));
  }, [code, profile, invalid]);

  async function join() {
    setBusy(true);
    try {
      const r = await joinSquad(code);
      router.replace(`/messages/${r.conversation_id}`);
    } catch {
      setError(invalid);
      setBusy(false);
    }
  }

  const n = preview?.members ?? 0;
  const inviter = preview ? preview.inviter.display_name || "@" + preview.inviter.username : "";

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="brand-gradient flex h-16 w-16 items-center justify-center rounded-3xl text-3xl animate-glow-enter">
        👥
      </span>
      <p className="font-display text-xl font-bold">{error ?? preview?.title ?? t.common.loading}</p>
      {!error && preview && (
        <>
          <p className="text-sm text-text-dim">
            {fr
              ? `${inviter} t'invite (${n} membre${n > 1 ? "s" : ""}). En rejoignant, vous vous suivrez mutuellement.`
              : `${inviter} invited you (${n} member${n > 1 ? "s" : ""}). Joining makes you follow each other.`}
          </p>
          <button
            type="button"
            onClick={join}
            disabled={busy}
            className="glow-cta brand-gradient pressable mt-2 w-full max-w-xs rounded-full py-3.5 font-display text-sm font-bold text-white disabled:opacity-40"
          >
            {fr ? "Rejoindre le groupe" : "Join the group"}
          </button>
          <button type="button" onClick={() => router.replace("/feed")} className="text-sm text-text-dim">
            {fr ? "Pas maintenant" : "Not now"}
          </button>
        </>
      )}
      {error && (
        <button type="button" onClick={() => router.replace("/feed")} className="text-sm text-brand">
          ← {fr ? "Retour à l'accueil" : "Back home"}
        </button>
      )}
    </div>
  );
}
