"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Profile } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { createGroupConversation, fetchMutuals } from "@/lib/data";
import { Avatar } from "@/components/Avatar";

export default function NewGroupPage() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [people, setPeople] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    // la base n'ajoute que des amis mutuels
    fetchMutuals(profile.id)
      .then(setPeople)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function create() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const cid = await createGroupConversation(title.trim(), [...selected]);
      router.push(`/messages/${cid}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md pt-[max(12px,env(safe-area-inset-top))]">
        <Link href="/messages" className="text-text-dim">←</Link>
        <h1 className="flex-1 text-xl font-black">
          {locale === "fr" ? "Nouveau groupe" : "New group"}
        </h1>
        <button
          onClick={create}
          disabled={busy || selected.size === 0}
          className="rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {locale === "fr" ? "Créer" : "Create"}
        </button>
      </header>

      <div className="p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={locale === "fr" ? "Nom du groupe (optionnel)" : "Group name (optional)"}
          maxLength={60}
          className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
        />
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-text-dim">
          {locale === "fr" ? `Ajouter des amis (${selected.size})` : `Add friends (${selected.size})`}
        </p>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-text-dim">{t.common.loading}</p>
      ) : people.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-text-dim">
          {locale === "fr"
            ? "Un groupe se crée entre amis mutuels : suivez-vous l'un l'autre d'abord."
            : "Groups are for mutual friends: follow each other first."}
        </p>
      ) : (
        <ul>
          {people.map((p) => {
            const on = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  onClick={() => toggle(p.id)}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left"
                >
                  <Avatar profile={p} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.display_name || p.username}</p>
                    <p className="truncate text-sm text-text-dim">@{p.username}</p>
                  </div>
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs"
                    style={{
                      borderColor: on ? "var(--brand)" : "var(--border)",
                      background: on ? "var(--brand)" : "transparent",
                      color: "#fff",
                    }}
                  >
                    {on ? "✓" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
