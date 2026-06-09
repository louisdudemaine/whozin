"use client";

import type { Post } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { PostCard } from "./PostCard";

export function PostModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 animate-fade" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-[480px] overflow-y-auto bg-background animate-fade">
        <button
          onClick={onClose}
          className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-background/90 px-4 py-3 text-sm text-text-dim backdrop-blur-md"
        >
          ← {t.feed.title}
        </button>
        <PostCard post={post} />
      </div>
    </div>
  );
}
