"use client";

import type { ConversationPreview } from "@whosin/shared";
import { Avatar } from "./Avatar";

/** Avatar d'une conversation : simple (1-1) ou superposé (groupe). */
export function ConvAvatar({ conv, size = 52 }: { conv: ConversationPreview; size?: number }) {
  if (!conv.isGroup) return <Avatar profile={conv.other} size={size} />;

  const a = conv.members[0] ?? null;
  const b = conv.members[1] ?? null;
  const small = Math.round(size * 0.66);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute right-0 top-0">
        <Avatar profile={a} size={small} />
      </div>
      <div className="absolute bottom-0 left-0 rounded-full ring-2 ring-background">
        <Avatar profile={b} size={small} />
      </div>
    </div>
  );
}

/** Nom affichable d'une conversation. */
export function convName(conv: ConversationPreview): string {
  if (!conv.isGroup) return conv.other?.display_name || conv.other?.username || "Conversation";
  if (conv.title) return conv.title;
  const names = conv.members.map((m) => m.display_name || m.username);
  if (names.length <= 3) return names.join(", ") || "Groupe";
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}
