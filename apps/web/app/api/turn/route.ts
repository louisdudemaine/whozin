import { NextResponse } from "next/server";

/**
 * 🔁 Serveurs ICE pour les appels WebRTC.
 * Ordre de préférence :
 *  1. Metered (TURN dédié) si METERED_TURN_KEY + METERED_TURN_DOMAIN sont posés (prod sérieuse)
 *  2. OpenRelay (TURN public gratuit du projet Metered) — débloque ~10-15 % des appels
 *     derrière NAT symétrique, sans clé
 *  + STUN Google dans tous les cas.
 * La config ne contient aucun secret côté client au-delà des credentials TURN
 * éphémères/publics — c'est le modèle standard WebRTC.
 */

export const runtime = "nodejs";

const STUN = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] };

const OPEN_RELAY = [
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turns:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

export async function GET() {
  const key = process.env.METERED_TURN_KEY;
  const domain = process.env.METERED_TURN_DOMAIN; // ex: whozin.metered.live

  if (key && domain) {
    try {
      const res = await fetch(
        `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`,
        { next: { revalidate: 3600 } }
      );
      if (res.ok) {
        const servers = await res.json();
        return NextResponse.json({ iceServers: [STUN, ...servers], provider: "metered" });
      }
    } catch {
      /* metered en panne -> open relay */
    }
  }
  return NextResponse.json({ iceServers: [STUN, ...OPEN_RELAY], provider: "openrelay" });
}
