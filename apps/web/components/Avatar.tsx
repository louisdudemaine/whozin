"use client";

import type { Profile } from "@whosin/shared";

function dicebear(seed: string) {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

export function Avatar({
  profile,
  size = 40,
}: {
  profile?: Pick<Profile, "username" | "display_name" | "avatar_url"> | null;
  size?: number;
}) {
  const src =
    profile?.avatar_url || dicebear(profile?.username || profile?.display_name || "anon");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={profile?.display_name || profile?.username || ""}
      width={size}
      height={size}
      className="rounded-full bg-surface-2 object-cover ring-1 ring-border shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
