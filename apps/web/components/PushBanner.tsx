"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { enablePush, pushSupported, subscribeToPush } from "@/lib/push";

const DISMISS_KEY = "wi.push.dismissed";

/** Opt-in push : silencieux si déjà accordé, discret sinon, jamais insistant. */
export function PushBanner() {
  const { profile } = useAuth();
  const { locale } = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!profile || !pushSupported()) return;
    if (Notification.permission === "granted") {
      // ré-abonne silencieusement (endpoint peut changer)
      subscribeToPush(profile.id);
      return;
    }
    if (Notification.permission === "default" && !localStorage.getItem(DISMISS_KEY)) {
      const t = setTimeout(() => setShow(true), 2500);
      return () => clearTimeout(t);
    }
  }, [profile]);

  if (!show || !profile) return null;
  const fr = locale === "fr";

  return (
    <div className="glass animate-glow-enter fixed left-1/2 top-[max(14px,env(safe-area-inset-top))] z-50 flex w-[calc(100%-24px)] max-w-[456px] -translate-x-1/2 items-center gap-3 rounded-2xl p-3">
      <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg">
        🔔
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <b>{fr ? "Sois prévenu·e" : "Get notified"}</b>
        <span className="block text-text-dim">
          {fr ? "Messages, appels et amis qui sortent." : "Messages, calls & friends going out."}
        </span>
      </p>
      <button
        onClick={async () => {
          setShow(false);
          await enablePush(profile.id);
        }}
        className="brand-gradient pressable shrink-0 rounded-full px-3.5 py-2 text-xs font-bold text-white"
      >
        {fr ? "Activer" : "Enable"}
      </button>
      <button
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setShow(false);
        }}
        aria-label="Fermer"
        className="shrink-0 px-1 text-text-dim"
      >
        ✕
      </button>
    </div>
  );
}
