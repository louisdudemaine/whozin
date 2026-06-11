"use client";

import { useEffect, useState } from "react";
import type { Post } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { fetchExplore } from "@/lib/data";
import { PostModal } from "@/components/PostModal";
import { Seismograph } from "@/components/Seismograph";
import { SuggestedPeople } from "@/components/SuggestedPeople";

export default function ExplorePage() {
  const { t } = useT();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Post | null>(null);

  useEffect(() => {
    fetchExplore()
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md pt-[max(12px,env(safe-area-inset-top))]">
        <h1 className="text-xl font-black">Explorer</h1>
      </header>

      <Seismograph />

      <SuggestedPeople />

      {loading ? (
        <p className="py-16 text-center text-sm text-text-dim">{t.common.loading}</p>
      ) : (
        <div className="grid grid-cols-3 gap-[2px]">
          {posts.map((p) => (
            <button
              key={p.id}
              onClick={() => setOpen(p)}
              className="relative aspect-square bg-surface-2"
            >
              {p.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
              {p.like_count > 0 && (
                <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[10px] font-bold text-white">
                  ❤ {p.like_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && <PostModal post={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
