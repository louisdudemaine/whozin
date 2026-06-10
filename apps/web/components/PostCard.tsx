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
    <article
      className="animate-glow-enter mb-4 overflow-hidden rounded-3xl border border-border"
      style={{
        background: "linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01)), var(--surface)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Link href={`/u/${post.author?.username ?? ""}`}>
          <span className="ring ring--static">
            <Avatar profile={post.author} size={34} />
          </span>
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <Link href={`/u/${post.author?.username ?? ""}`} className="block truncate text-sm font-semibold">
            {post.author?.display_name || post.author?.username}
          </Link>
          <span className="block truncate text-xs text-text-dim">{timeAgo(post.created_at, locale)}</span>
        </div>
      </div>

      {/* média — ratio 4:3, pastille lieu PAR-DESSUS la photo (signature Whozin) */}
      {post.photo_url ? (
        <button
          onDoubleClick={() => !liked && onLike()}
          className="relative block w-full"
          aria-label="post image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.photo_url}
            alt={post.body ?? ""}
            className="aspect-[4/3] w-full bg-surface-2 object-cover"
            loading="lazy"
          />
          {post.place && cat && (
            <span
              className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md"
              style={{ background: cat.color + "cc" }}
            >
              {cat.emoji} {post.place.name}
            </span>
          )}
        </button>
      ) : (
        post.body && (
          <div className="brand-gradient relative flex aspect-[4/3] w-full items-center justify-center p-8">
            <p className="text-center text-2xl font-black leading-snug text-white">{post.body}</p>
            {post.place && cat && (
              <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md">
                {cat.emoji} {post.place.name}
              </span>
            )}
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

      <div className="pb-3" />

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
