import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

/**
 * Envoi de notifications push.
 * Auth: JWT Supabase de l'expéditeur (Authorization: Bearer).
 * Cible filtrée par push_targets/can_push (lien consenti) ; titre attribué à l'expéditeur ; 60 push/h par paire.
 * Anti-abus: si conversationId fourni, on vérifie que l'expéditeur ET la cible y participent.
 * La clé VAPID privée ne vit QUE côté serveur.
 */

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4096;

function safeAppPath(value: unknown): string {
  if (typeof value !== "string") return "/feed";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/feed";
  try {
    const url = new URL(value, "https://whozin.app");
    return url.origin === "https://whozin.app" ? `${url.pathname}${url.search}${url.hash}` : "/feed";
  } catch {
    return "/feed";
  }
}

function clipped(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload trop volumineux" }, { status: 413 });
  }

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
  if (!UUID_RE.test(target)) {
    return NextResponse.json({ error: "target invalide" }, { status: 400 });
  }
  if (conversationId && !UUID_RE.test(conversationId)) {
    return NextResponse.json({ error: "conversation invalide" }, { status: 400 });
  }
  if (target === sender.id) return NextResponse.json({ sent: 0 });

  // anti-abus : l'expéditeur doit participer à la conversation invoquée
  if (conversationId) {
    const { data: isMember } = await supabase.rpc("is_conversation_participant", {
      conv: conversationId,
    });
    if (!isMember) return NextResponse.json({ error: "non autorisé" }, { status: 403 });
    // la cible aussi doit en être membre : un membre parti ne reçoit plus le contenu du groupe
    const { data: targetMember } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", target)
      .maybeSingle();
    if (!targetMember) return NextResponse.json({ sent: 0 });
  }

  // anti-énumération : RPC qui renvoie l'abonnement de CETTE cible seulement (si non bloqué)
  const { data: subs } = await supabase.rpc("push_targets", { target });
  type Sub = { endpoint: string; p256dh: string; auth: string };
  const subList = (subs ?? []) as Sub[];
  if (subList.length === 0) return NextResponse.json({ sent: 0 });

  // plafond par paire expéditeur -> cible, compté seulement quand un lien existe ; refus ou panne = pas d'envoi
  const { data: ok, error: qErr } = await supabase.rpc("take_quota", { p_kind: `push:${target.toLowerCase()}` });
  if (qErr || ok !== true) return NextResponse.json({ error: "trop de requêtes" }, { status: 429 });

  // le titre nomme toujours l'expéditeur réel (lu en base) : plus de « Whozin · Sécurité » au nom de l'app
  const { data: me } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", sender.id)
    .maybeSingle();
  if (!me) return NextResponse.json({ sent: 0 });
  const name = clipped(me.display_name || me.username, 80);
  const asked = clipped(body.title, 80);
  const title = asked === name || asked.startsWith(`${name} · `) ? asked : clipped(`${name} · ${asked}`, 80);

  const payload = JSON.stringify({
    title,
    body: clipped(body.body, 160),
    url: safeAppPath(body.url),
    tag: clipped(body.tag, 64) || undefined,
  });

  let sent = 0;
  await Promise.all(
    subList.map(async (s) => {
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
