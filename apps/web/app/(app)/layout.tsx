"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { CallProvider } from "@/lib/calls";
import { CallOverlay } from "@/components/CallOverlay";
import { PushBanner } from "@/components/PushBanner";
import { getSupabase } from "@/lib/supabase";
import { BottomNav } from "@/components/BottomNav";
import { AuthScreen } from "@/components/AuthScreen";
import { CreateModal } from "@/components/CreateModal";
import { unreadCount } from "@/lib/data";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const userId = session?.user?.id;
  const path = usePathname();
  // un fil de conversation est plein écran (pas de tab bar, comme Instagram)
  const isThread = /^\/messages\/[^/]+$/.test(path);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const refresh = () => unreadCount().then((n) => alive && setUnread(n)).catch(() => {});
    refresh();

    const supabase = getSupabase();
    const channel = supabase
      .channel("notif-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        refresh
      )
      .subscribe();

    window.addEventListener("wi:notif-read", refresh);
    const openCreate = () => setCreateOpen(true);
    window.addEventListener("wi:open-create", openCreate);
    return () => {
      alive = false;
      supabase.removeChannel(channel);
      window.removeEventListener("wi:notif-read", refresh);
      window.removeEventListener("wi:open-create", openCreate);
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="brand-gradient flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl text-2xl">
          📍
        </div>
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <CallProvider>
      <div className={isThread ? "min-h-[100dvh]" : "min-h-[100dvh] pb-28"}>{children}</div>

      {!isThread && <BottomNav unread={unread} />}

      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => window.dispatchEvent(new CustomEvent("wi:refresh"))}
      />
      <CallOverlay />
      <PushBanner />
    </CallProvider>
  );
}
