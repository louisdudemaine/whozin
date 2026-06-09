"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { timeAgo, type Comment, type Post } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { addComment, fetchComments } from "@/lib/data";
import { Avatar } from "./Avatar";

export function CommentsSheet({
  post,
  onClose,
  onAdded,
}: {
  post: Post;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t, locale } = useT();
  const { profile } = useAuth();
  const [list, setList] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setList(await fetchComments(post.id));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  async function send() {
    if (!profile || !body.trim()) return;
    setBusy(true);
    try {
      await addComment(post.id, profile.id, body.trim());
      setBody("");
      await load();
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade" onClick={onClose} />
      <div className="relative flex max-h-[80dvh] w-full max-w-[480px] flex-col rounded-t-3xl border-t border-border bg-surface animate-slide-up">
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border" />
        <h2 className="px-5 py-3 text-base font-bold">
          {t.feed.comments} ({list.length})
        </h2>

        <div className="flex-1 overflow-y-auto px-5">
          {loading ? (
            <p className="py-6 text-center text-sm text-text-dim">{t.common.loading}</p>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-dim">{t.feed.empty}</p>
          ) : (
            <ul className="flex flex-col gap-4 pb-3">
              {list.map((c) => (
                <li key={c.id} className="flex items-start gap-3">
                  <Link href={`/u/${c.author?.username ?? ""}`}>
                    <Avatar profile={c.author} size={34} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">
                        {c.author?.display_name || c.author?.username}
                      </span>{" "}
                      <span className="text-xs text-text-dim">{timeAgo(c.created_at, locale)}</span>
                    </p>
                    <p className="text-sm text-text">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2 border-t border-border p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={t.feed.writeComment}
            maxLength={500}
            className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-base outline-none focus:border-brand"
          />
          <button
            onClick={send}
            disabled={busy || !body.trim()}
            className="brand-gradient rounded-full px-5 font-bold text-white disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
