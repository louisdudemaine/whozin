"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { joinSquad } from "@/lib/data";

/** Atterrissage d'un lien d'invitation squad : rejoint le groupe puis ouvre la conversation. */
export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { profile } = useAuth();
  const { locale } = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const fr = locale === "fr";

  useEffect(() => {
    if (!profile) return;
    joinSquad(code)
      .then((r) => router.replace(`/messages/${r.conversation_id}`))
      .catch(() => setError(fr ? "Invitation invalide ou expirée." : "Invalid or expired invite."));
  }, [code, profile, router, fr]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="brand-gradient flex h-16 w-16 items-center justify-center rounded-3xl text-3xl animate-glow-enter">
        👥
      </span>
      <p className="font-display text-xl font-bold">
        {error ?? (fr ? "On t'ajoute à la gang…" : "Adding you to the squad…")}
      </p>
      {error && (
        <button onClick={() => router.replace("/feed")} className="text-sm text-brand">
          ← {fr ? "Retour à l'accueil" : "Back home"}
        </button>
      )}
    </div>
  );
}
