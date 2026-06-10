"use client";

/** Web Push côté client : abonnement de l'appareil + envoi de notifs aux autres. */

import { getSupabase } from "./supabase";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Enregistre le SW et abonne cet appareil aux push (suppose permission accordée). */
export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!pushSupported()) return false;
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return false;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    await getSupabase().from("push_subscriptions").upsert({
      endpoint: json.endpoint,
      user_id: userId,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    });
    return true;
  } catch {
    return false;
  }
}

/** Demande la permission puis abonne. Renvoie l'état final. */
export async function enablePush(userId: string): Promise<NotificationPermission | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm === "granted") await subscribeToPush(userId);
  return perm;
}

/** Notifie un autre utilisateur (fire-and-forget, jamais bloquant). */
export async function pushNotify(
  targetUserId: string,
  payload: { title: string; body?: string; url?: string; tag?: string },
  conversationId?: string | null
): Promise<void> {
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    void fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ target: targetUserId, conversationId: conversationId ?? null, ...payload }),
    });
  } catch {
    /* jamais bloquant */
  }
}
