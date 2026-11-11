import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * 🔁 Serveurs ICE pour les appels WebRTC : STUN Google + TURN gratuit OpenRelay (aucun secret).
 * Auth : JWT Supabase (Authorization: Bearer) ; 60 demandes/h par compte (take_quota).
 * Ne JAMAIS servir ici la liste d'identifiants d'un compte TURN payant : tout compte
 * (inscription libre) la récupérerait. TURN payant = identifiants par utilisateur, expirants.
 */

export const runtime = "nodejs";

const STUN = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] };

const OPEN_RELAY = [
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turns:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "auth requise" }, { status: 401 });

  // client lié au JWT : take_quota compte au nom de l'utilisateur
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return NextResponse.json({ error: "jwt invalide" }, { status: 401 });

  // refus ou panne du compteur -> 429 ; le client retombe sur STUN seul
  const { data: ok, error: qErr } = await supabase.rpc("take_quota", { p_kind: "turn" });
  if (qErr || ok !== true) return NextResponse.json({ error: "trop de requêtes" }, { status: 429 });

  return NextResponse.json({ iceServers: [STUN, ...OPEN_RELAY], provider: "openrelay" });
}
