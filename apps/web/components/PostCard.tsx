"use client";

import { useState } from "react";
import Link from "next/link";
import { getCategory, timeAgo, type Post } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { toggleLike } from "@/lib/data";
import { Avatar } from "./Avatar";
import { CommentsSheet } from "./CommentsSheet";

export function PostCard({ post }: { post: Post }) {
  const { t, locale } = useT();
  const { profile } = useAuth();
  const [liked, setLiked] = useState(!!post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const cat = post.place ? getCategory(post.place.category) : null;

  async function onLike() {
    if (!profile) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      await toggleLike(post.id, profile.id, liked);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  }

  return (
    <article className="mb-1">
      {/* header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Link href={`/u/${post.author?.username ?? ""}`}>
          <span
            className="block rounded-full p-[2px]"
            style={{ background: cat ? `linear-gradient(135deg, ${cat.color}, var(--brand-2))` : "var(--border)" }}
          >
            <span className="block rounded-full border-2 border-background">
              <Avatar profile={post.author} size={34} />
            </span>
          </span>
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <Link href={`/u/${post.author?.username ?? ""}`} className="block truncate text-sm font-semibold">
            {post.author?.display_name || post.author?.username}
          </Link>
          {post.place && cat && (
            <span className="block truncate text-xs" style={{ color: cat.color }}>
              {cat.emoji} {post.place.name}
            </span>
          )}
        </div>
        <span className="text-xs text-text-dim">{timeAgo(post.created_at, locale)}</span>
      </div>

      {/* média */}
      {post.photo_url ? (
        <button
          onDoubleClick={() => !liked && onLike()}
          className="block w-full"
          aria-label="post image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.photo_url}
            alt={post.body ?? ""}
            className="aspect-square w-full bg-surface-2 object-cover"
            loading="lazy"
          />
        </button>
      ) : (
        post.body && (
          <div className="brand-gradient flex aspect-square w-full items-center justify-center p-8">
            <p className="text-center text-2xl font-black leading-snug text-white">{post.body}</p>
          </div>
        )
      )}

      {/* barre d'actions */}
      <div className="flex items-center gap-4 px-3 pt-2.5">
        <button onClick={onLike} aria-label="J'aime">
          <Heart filled={liked} />
        </button>
        <button onClick={() => setCommentsOpen(true)} aria-label="Commenter">
          <Bubble />
        </button>
        <Share />
        <button onClick={() => setSaved((s) => !s)} className="ml-auto" aria-label="Enregistrer">
          <Bookmark filled={saved} />
        </button>
      </div>

      {/* likes */}
      {likeCount > 0 && (
        <p className="px-3 pt-2 text-sm font-semibold">
          {likeCount} {likeCount > 1 ? t.feed.likes : t.feed.like}
        </p>
      )}

      {/* légende (si photo + texte) */}
      {post.photo_url && post.body && (
        <p className="px-3 pt-1 text-sm">
          <Link href={`/u/${post.author?.username ?? ""}`} className="font-semibold">
            {post.author?.username}
          </Link>{" "}
          {post.body}
        </p>
      )}

      {/* commentaires */}
      {commentCount > 0 && (
        <button
          onClick={() => setCommentsOpen(true)}
          className="px-3 pt-1 text-sm text-text-dim"
        >
          {locale === "fr" ? `Voir les ${commentCount} commentaires` : `View all ${commentCount} comments`}
        </button>
      )}

      <div className="px-3 pb-3 pt-1 text-[11px] uppercase tracking-wide text-text-dim">
        {timeAgo(post.created_at, locale)}
      </div>

      {commentsOpen && (
        <CommentsSheet
          post={post}
          onClose={() => setCommentsOpen(false)}
          onAdded={() => setCommentCount((c) => c + 1)}
        />
      )}
    </article>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26"
      fill={filled ? "var(--brand)" : "none"}
      stroke={filled ? "var(--brand)" : "var(--text)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" />
    </svg>
  );
}
function Bubble() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8 8 0 0 1-11.5 7.2L3 21l2.3-6.5A8 8 0 1 1 21 11.5Z" />
    </svg>
  );
}
function Share() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}
function Bookmark({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26"
      fill={filled ? "var(--text)" : "none"} stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
    </svg>
  );
}
