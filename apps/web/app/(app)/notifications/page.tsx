"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { timeAgo, type AppNotification, type NotificationType } from "@whosin/shared";
import { useT } from "@/lib/locale";
import { fetchNotifications, markNotificationsRead } from "@/lib/data";
import { Avatar } from "@/components/Avatar";

const ICON: Record<NotificationType, string> = {
  follow: "👤",
  like: "❤️",
  comment: "💬",
  checkin_join: "📍",
};

export default function NotificationsPage() {
  const { t, locale } = useT();
  const [list, setList] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications()
      .then(setList)
      .catch(() => {})
      .finally(() => setLoading(false));
    markNotificationsRead()
      .then(() => window.dispatchEvent(new CustomEvent("wi:notif-read")))
      .catch(() => {});
  }, []);

  function label(type: NotificationType) {
    switch (type) {
      case "follow":
        return t.notifications.followed;
      case "like":
        return t.notifications.liked;
      case "comment":
        return t.notifications.commented;
      case "checkin_join":
        return t.notifications.joinedCheckin;
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur-md pt-[max(12px,env(safe-area-inset-top))]">
        <h1 className="text-xl font-black">{t.notifications.title}</h1>
      </header>

      {loading ? (
        <p className="py-16 text-center text-sm text-text-dim">{t.common.loading}</p>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-dim">{t.notifications.empty}</p>
      ) : (
        <ul>
          {list.map((n) => (
            <li
              key={n.id}
              className="flex items-center gap-3 border-b border-border px-4 py-3"
              style={{ background: n.read ? undefined : "var(--surface)" }}
            >
              <div className="relative">
                <Avatar profile={n.actor} size={42} />
                <span className="absolute -bottom-1 -right-1 text-sm">{ICON[n.type]}</span>
              </div>
              <p className="flex-1 text-sm">
                <Link href={`/u/${n.actor?.username ?? ""}`} className="font-bold">
                  {n.actor?.display_name || n.actor?.username}
                </Link>{" "}
                <span className="text-text-dim">{label(n.type)}</span>
                <span className="ml-1 text-xs text-text-dim">· {timeAgo(n.created_at, locale)}</span>
              </p>
              {!n.read && <span className="h-2 w-2 rounded-full bg-brand" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
