"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SuggestReason, SuggestedPerson } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { fetchSuggestedPeople, follow } from "@/lib/data";
import { Avatar } from "./Avatar";

function reasonText(r: SuggestReason, shared: number, fr: boolean): string {
  switch (r) {
    case "co_likes":
      return fr ? "Aime les mêmes posts" : "Likes the same posts";
    case "shared_taste":
      return fr ? "Goûts en commun" : "Shared taste";
    case "fof":
      return fr ? "Suivi·e par tes amis" : "Followed by friends";
    default:
      return fr ? "Populaire" : "Popular";
  }
}

export function SuggestedPeople() {
  const { profile } = useAuth();
  const { locale } = useT();
  const fr = locale === "fr";
  const [people, setPeople] = useState<SuggestedPerson[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSuggestedPeople().then(setPeople).catch(() => {});
  }, []);

  if (people.length === 0) return null;

  async function onFollow(id: string) {
    if (!profile) return;
    setFollowed((s) => new Set(s).add(id));
    try {
      await follow(profile.id, id);
    } catch {
      setFollowed((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  return (
    <section className="border-b border-border py-3">
      <div className="flex items-center gap-2 px-4 pb-2">
        <span className="text-sm font-black">{fr ? "Pour toi" : "For you"}</span>
        <span className="text-xs text-text-dim">{fr ? "· suggestions selon tes goûts" : "· based on your taste"}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1">
        {people.map((p) => {
          const isFollowed = followed.has(p.id);
          return (
            <div
              key={p.id}
              className="flex w-36 shrink-0 flex-col items-center rounded-2xl border border-border bg-surface p-3 text-center"
            >
              <Link href={`/u/${p.username}`}>
                <Avatar profile={p} size={56} />
              </Link>
              <Link href={`/u/${p.username}`} className="mt-2 w-full truncate text-sm font-semibold">
                {p.display_name || p.username}
              </Link>
              <span className="mb-2 mt-0.5 line-clamp-2 text-[11px] text-brand-2">
                {reasonText(p.reason, p.shared, fr)}
              </span>
              <button
                onClick={() => onFollow(p.id)}
                disabled={isFollowed}
                className={
                  isFollowed
                    ? "w-full rounded-lg border border-border py-1.5 text-xs font-semibold text-text-dim"
                    : "brand-gradient w-full rounded-lg py-1.5 text-xs font-bold text-white"
                }
              >
                {isFollowed ? (fr ? "Suivi·e" : "Following") : fr ? "Suivre" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
