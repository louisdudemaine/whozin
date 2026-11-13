"use client";

import { useEffect, useState } from "react";
import { hapticSuccess, hapticWarn } from "./haptics";

/**
 * ✨ Toasts — confirmations élégantes, appelables de N'IMPORTE OÙ (event global).
 * `toast("Move publié 🌃")` depuis du code non-composant ; <ToastHost/> dans le layout les affiche.
 */

export type ToastKind = "success" | "info" | "error";

interface ToastDetail {
  msg: string;
  kind: ToastKind;
}

export function toast(msg: string, kind: ToastKind = "success"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>("wi:toast", { detail: { msg, kind } }));
}

interface ToastItem extends ToastDetail {
  id: number;
}

let seq = 0;

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      const item: ToastItem = { ...d, id: ++seq };
      setItems((prev) => [...prev, item]);
      if (d.kind === "error") hapticWarn();
      else hapticSuccess();
      // une erreur reste plus longtemps : le temps de la lire (ou de l'entendre)
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== item.id)), d.kind === "error" ? 6000 : 2600);
    };
    window.addEventListener("wi:toast", onToast);
    return () => window.removeEventListener("wi:toast", onToast);
  }, []);

  // toujours monté : une région live doit exister AVANT le message pour que les lecteurs d'écran l'annoncent
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(16px,env(safe-area-inset-top))] z-[120] flex flex-col items-center gap-2 px-4"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : undefined}
          className="glass animate-slide-down pointer-events-auto flex max-w-[440px] items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-lg"
          style={{
            borderColor:
              t.kind === "error" ? "var(--brand)" : t.kind === "info" ? "var(--border)" : "var(--accent)",
          }}
        >
          <span aria-hidden="true">{t.kind === "error" ? "⚠️" : t.kind === "info" ? "💬" : "✓"}</span>
          <span className="text-text">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
