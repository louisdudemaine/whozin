"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getOrCreateConversation } from "@/lib/data";

export function MessageButton({
  targetUserId,
  variant = "full",
  label = "Message",
}: {
  targetUserId: string;
  variant?: "full" | "icon";
  label?: string;
}) {
  const router = useRouter();
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!profile || profile.id === targetUserId) return null;

  async function open() {
    setBusy(true);
    try {
      const convId = await getOrCreateConversation(targetUserId);
      router.push(`/messages/${convId}`);
    } catch {
      setBusy(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        onClick={open}
        disabled={busy}
        aria-label={label}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-text disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={open}
      disabled={busy}
      className="rounded-xl border border-border py-2.5 px-4 text-sm font-semibold text-text disabled:opacity-50"
    >
      {busy ? "…" : label}
    </button>
  );
}
