"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Icon({ name, active }: { name: string; active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  const common = {
    width: 24,
    height: 24,
    fill: "none",
    stroke: c,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" {...common} fill={active ? "var(--text)" : "none"}>
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
        </svg>
      );
    case "explore":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="11" cy="11" r="7.5" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "map":
      return (
        <svg viewBox="0 0 24 24" {...common} fill={active ? "var(--text)" : "none"}>
          <path d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11Z" />
          <circle cx="12" cy="10" r="2.5" fill="var(--background)" stroke="var(--background)" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 12 0v1" />
        </svg>
      );
    default:
      return null;
  }
}

/** Night Dock — verre fumé qui lévite, l'action principale respire au centre. */
export function BottomNav({ unread = 0 }: { unread?: number }) {
  const path = usePathname();

  const openCreate = () => window.dispatchEvent(new CustomEvent("wi:open-create"));

  return (
    <nav
      className="glass fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-1/2 z-40 flex h-16 w-[calc(100%-24px)] max-w-[456px] -translate-x-1/2 items-center justify-around rounded-full"
      style={{
        background:
          "linear-gradient(160deg, light-dark(rgba(255,255,255,.82), rgba(16,16,27,.78)), light-dark(rgba(255,255,255,.62), rgba(16,16,27,.6)))",
      }}
    >
      <Tab href="/feed" icon="home" active={path.startsWith("/feed")} />
      <Tab href="/explore" icon="explore" active={path.startsWith("/explore")} />

      {/* Check-in / Créer : le seul élément du dock qui respire en permanence */}
      <button
        onClick={openCreate}
        aria-label="Partager"
        className="pressable -mt-7 flex h-[52px] w-[52px] items-center justify-center rounded-full text-2xl font-bold text-white"
        style={{
          background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
          border: "1px solid rgba(255,255,255,.25)",
          animation: "neon-breathe 4s ease-in-out infinite",
        }}
      >
        +
      </button>

      <Tab href="/map" icon="map" active={path.startsWith("/map")} />

      <Link href="/profile" aria-label="Profil" className="relative flex h-full w-12 items-center justify-center">
        <NavGlow active={path.startsWith("/profile")} />
        <Icon name="profile" active={path.startsWith("/profile")} />
        {unread > 0 && (
          <span className="absolute right-1 top-3 h-2 w-2 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
        )}
      </Link>
    </nav>
  );
}

function Tab({ href, icon, active }: { href: string; icon: string; active: boolean }) {
  return (
    <Link href={href} className="relative flex h-full w-12 items-center justify-center">
      <NavGlow active={active} />
      <Icon name={icon} active={active} />
      {active && (
        <span className="absolute top-2.5 h-1 w-1 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
      )}
    </Link>
  );
}

/* l'onglet actif est littéralement « allumé » : lueur radiale sous l'icône */
function NavGlow({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      aria-hidden
      className="absolute h-8 w-8 rounded-full"
      style={{
        background: "radial-gradient(circle, var(--glow-rose), transparent 70%)",
        filter: "blur(6px)",
      }}
    />
  );
}
