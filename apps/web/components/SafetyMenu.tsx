"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { blockUser, reportTarget, unblockUser } from "@/lib/data";

const REASONS = [
  { key: "spam", fr: "Spam ou arnaque", en: "Spam or scam" },
  { key: "harassment", fr: "Harcèlement", en: "Harassment" },
  { key: "inappropriate", fr: "Contenu inapproprié", en: "Inappropriate content" },
  { key: "fake", fr: "Faux profil", en: "Fake profile" },
  { key: "other", fr: "Autre", en: "Other" },
];

/**
 * Menu ⋯ de sécurité : signaler (post/profil/message) et bloquer/débloquer (profils).
 * `targetUserId` = l'auteur ; `targetType`/`targetId` = l'objet signalé.
 */
export function SafetyMenu({
  targetType,
  targetId,
  targetUserId,
  blocked = false,
  onBlockChange,
}: {
  targetType: "profile" | "post" | "message" | "story";
  targetId: string;
  targetUserId: string;
  blocked?: boolean;
  onBlockChange?: (blocked: boolean) => void;
}) {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (!profile || profile.id === targetUserId) return null;

  async function doBlock() {
    if (!profile) return;
    if (blocked) {
      await unblockUser(profile.id, targetUserId);
      onBlockChange?.(false);
      flash(fr ? "Débloqué·e" : "Unblocked");
    } else {
      await blockUser(profile.id, targetUserId);
      onBlockChange?.(true);
      flash(fr ? "Bloqué·e — cette personne ne te verra plus" : "Blocked — they won't see you anymore");
    }
    setOpen(false);
  }

  async function doReport(reasonKey: string) {
    if (!profile) return;
    const r = REASONS.find((x) => x.key === reasonKey)!;
    await reportTarget(profile.id, targetType, targetId, `${reasonKey}: ${fr ? r.fr : r.en}`);
    setReporting(false);
    setOpen(false);
    flash(fr ? "Merci, signalement reçu 🙏" : "Thanks, report received 🙏");
  }

  function flash(msg: string) {
    setDone(msg);
    setTimeout(() => setDone(null), 2600);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Options"
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-dim"
      >
        ⋯
      </button>

      {done && (
        <div className="glass fixed left-1/2 top-[max(14px,env(safe-area-inset-top))] z-[95] -translate-x-1/2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-semibold animate-fade">
          {done}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 animate-fade" onClick={() => { setOpen(false); setReporting(false); }} />
          <div className="glass relative w-full max-w-[480px] rounded-t-3xl p-5 pb-[max(20px,env(safe-area-inset-bottom))] animate-slide-up" style={{ background: "rgba(16,16,27,.92)" }}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            {!reporting ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setReporting(true)}
                  className="pressable rounded-2xl border border-border py-3.5 font-semibold"
                >
                  🚩 {fr ? "Signaler" : "Report"}
                </button>
                <button
                  onClick={doBlock}
                  className="pressable rounded-2xl py-3.5 font-bold text-white"
                  style={{ background: blocked ? "var(--surface-2)" : "linear-gradient(135deg,#ff2e63,#ff7849)" }}
                >
                  {blocked ? `↩️ ${fr ? "Débloquer" : "Unblock"}` : `🚫 ${fr ? "Bloquer" : "Block"}`}
                </button>
                <button onClick={() => setOpen(false)} className="py-2.5 text-sm text-text-dim">
                  {fr ? "Annuler" : "Cancel"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="mb-1 font-display text-base font-bold">
                  {fr ? "Pourquoi tu signales ça ?" : "Why are you reporting this?"}
                </p>
                {REASONS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => doReport(r.key)}
                    className="pressable rounded-2xl border border-border py-3 text-left px-4 text-sm font-semibold"
                  >
                    {fr ? r.fr : r.en}
                  </button>
                ))}
                <button onClick={() => setReporting(false)} className="py-2 text-sm text-text-dim">
                  ← {fr ? "Retour" : "Back"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
