"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Icon({ name, active }: { name: string; active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  const fill = active ? "var(--text)" : "none";
  const common = {
    width: 26,
    height: 26,
    fill: "none",
    stroke: c,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" {...common} fill={fill} stroke={active ? "var(--text)" : "var(--text-dim)"}>
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
        </svg>
      );
    case "explore":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="11" cy="11" r="7.5" /><path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "map":
      return (
        <svg viewBox="0 0 24 24" {...common} fill={fill}>
          <path d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11Z" />
          <circle cx="12" cy="10" r="2.5" fill="var(--background)" stroke="var(--background)" />
        </svg>
      );
    default:
      return null;
  }
}

export function BottomNav({ unread = 0 }: { unread?: number }) {
  const path = usePathname();

  const openCreate = () =>
    window.dispatchEvent(new CustomEvent("wi:open-create"));

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur-md">
      <div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        <Tab href="/feed" icon="home" active={path.startsWith("/feed")} />
        <Tab href="/explore" icon="explore" active={path.startsWith("/explore")} />

        {/* Créer (centre) */}
        <button
          onClick={openCreate}
          aria-label="Créer"
          className="flex items-center justify-center py-2.5"
        >
          <span className="brand-gradient flex h-9 w-11 items-center justify-center rounded-xl text-2xl font-bold text-white shadow-md shadow-brand/30">
            +
          </span>
        </button>

        <Tab href="/map" icon="map" active={path.startsWith("/map")} />

        {/* Profil (avatar-like) */}
        <Link
          href="/profile"
          aria-label="Profil"
          className="relative flex items-center justify-center py-2.5"
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              border: path.startsWith("/profile")
                ? "2px solid var(--text)"
                : "2px solid var(--text-dim)",
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
              stroke={path.startsWith("/profile") ? "var(--text)" : "var(--text-dim)"} strokeWidth="2">
              <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 12 0v1" />
            </svg>
          </span>
          {unread > 0 && (
            <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-brand" />
          )}
        </Link>
      </div>
    </nav>
  );
}

function Tab({ href, icon, active }: { href: string; icon: string; active: boolean }) {
  return (
    <Link href={href} className="flex items-center justify-center py-2.5 px-3">
      <Icon name={icon} active={active} />
    </Link>
  );
}
