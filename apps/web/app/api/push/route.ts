import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

/**
 * Envoi de notifications push.
 * Auth: JWT Supabase de l'expéditeur (Authorization: Bearer).
 * Anti-abus: si conversationId fourni, on vérifie que l'expéditeur y participe.
 * La clé VAPID privée ne vit QUE côté serveur.
 */

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  const priv = process.env.VAPID_PRIVATE_KEY;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!priv || !pub) {
    return NextResponse.json({ error: "push non configuré" }, { status: 503 });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@whozin.app", pub, priv);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "auth requise" }, { status: 401 });

  // client lié au JWT de l'expéditeur -> la RLS s'applique en son nom
  const supabase = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const sender = userData?.user;
  if (userErr || !sender) return NextResponse.json({ error: "jwt invalide" }, { status: 401 });

  let body: {
    target?: string;
    conversationId?: string | null;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json invalide" }, { status: 400 });
  }
  const { target, conversationId } = body;
  if (!target || !body.title) {
    return NextResponse.json({ error: "target/title requis" }, { status: 400 });
  }
  if (target === sender.id) return NextResponse.json({ sent: 0 });

  // anti-abus : l'expéditeur doit participer à la conversation invoquée
  if (conversationId) {
    const { data: isMember } = await supabase.rpc("is_conversation_participant", {
      conv: conversationId,
    });
    if (!isMember) return NextResponse.json({ error: "non autorisé" }, { status: 403 });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", target);

  const payload = JSON.stringify({
    title: String(body.title).slice(0, 80),
    body: String(body.body ?? "").slice(0, 160),
    url: typeof body.url === "string" && body.url.startsWith("/") ? body.url : "/feed",
    tag: body.tag,
  });

  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 }
        );
        sent++;
      } catch (e: unknown) {
        // abonnement mort (410/404) -> nettoyage
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 410 || code === 404) {
          await supabase.rpc("push_prune", { dead_endpoint: s.endpoint });
        }
      }
    })
  );

  return NextResponse.json({ sent });
}
