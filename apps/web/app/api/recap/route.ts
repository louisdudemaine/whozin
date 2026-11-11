import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * 🌅 Narration du recap — IA si ANTHROPIC_API_KEY, sinon plume déterministe.
 * Le client envoie les chiffres déjà agrégés par le RPC night_recap (jamais de données brutes).
 */

export const runtime = "nodejs";
export const maxDuration = 30;

interface RecapPayload {
  stops?: { name: string; category: string }[];
  crossedNames?: string[];
  likes?: number;
  matches?: number;
  locale?: string;
}

const MAX_BODY_BYTES = 8192;

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizePayload(input: RecapPayload): RecapPayload {
  return {
    locale: input.locale === "en" ? "en" : "fr",
    likes: Math.max(0, Math.min(9999, Number(input.likes) || 0)),
    matches: Math.max(0, Math.min(9999, Number(input.matches) || 0)),
    crossedNames: Array.isArray(input.crossedNames)
      ? input.crossedNames.slice(0, 25).map((name) => cleanText(name, 60)).filter(Boolean)
      : [],
    stops: Array.isArray(input.stops)
      ? input.stops.slice(0, 12).map((stop) => ({
          name: cleanText(stop?.name, 80),
          category: cleanText(stop?.category, 40),
        })).filter((stop) => stop.name)
      : [],
  };
}

function fallbackNarration(p: RecapPayload, fr: boolean): string {
  const n = p.stops?.length ?? 0;
  const c = p.crossedNames?.length ?? 0;
  const likes = p.likes ?? 0;
  const last = p.stops?.[n - 1]?.name;
  if (n === 0) {
    return fr
      ? "Soirée tranquille — la ville t'attend ce soir. 🌙"
      : "Quiet night — the city's waiting for you tonight. 🌙";
  }
  const bits: string[] = [];
  bits.push(
    fr
      ? `${n} spot${n > 1 ? "s" : ""}${last ? `, fini au ${last}` : ""}`
      : `${n} spot${n > 1 ? "s" : ""}${last ? `, ended at ${last}` : ""}`
  );
  if (c > 0)
    bits.push(
      fr
        ? `${c} ${c > 1 ? "personnes croisées" : "personne croisée"}`
        : `crossed paths with ${c}`
    );
  if (likes > 0) bits.push(fr ? `${likes} likes` : `${likes} likes`);
  if ((p.matches ?? 0) > 0) bits.push(fr ? `${p.matches} match 💘` : `${p.matches} match 💘`);
  return fr
    ? `${bits.join(" · ")} — la ville se souvient de toi. ✨`
    : `${bits.join(" · ")} — the city remembers you. ✨`;
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload trop volumineux" }, { status: 413 });
  }

  // Connexion exigée : sans elle, la route servait de relais gratuit vers le modèle payant.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "auth requise" }, { status: 401 });
  // client lié au JWT : take_quota compte au nom de l'utilisateur (sinon appel anon, toujours refusé)
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: u } = await supabase.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ error: "jwt invalide" }, { status: 401 });

  let body: RecapPayload;
  try {
    body = normalizePayload(await req.json());
  } catch {
    return NextResponse.json({ error: "json invalide" }, { status: 400 });
  }
  const fr = body.locale !== "en";

  const key = process.env.ANTHROPIC_API_KEY;
  // plafond par compte et total (public.take_quota) ; refus, panne ou fonction absente = plume locale
  if (key && (body.stops?.length ?? 0) > 0 && (await supabase.rpc("take_quota", { p_kind: "recap" })).data === true) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content: `Tu racontes la soirée d'hier d'un utilisateur de Whozin (app sociale nightlife à Montréal), comme un ami complice le lendemain matin. En ${fr ? "français québécois" : "English"}, 2 phrases max, chaleureux et un peu taquin, sans hashtags. Arrêts: ${(body.stops ?? [])
                .map((s) => `${s.name} (${s.category})`)
                .join(" → ")}. Croisé: ${(body.crossedNames ?? []).join(", ") || "personne"}. ${body.likes ?? 0} likes reçus, ${body.matches ?? 0} match(s).`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.content?.[0]?.text;
        if (text) return NextResponse.json({ narration: text, ai: true });
      }
    } catch {
      /* IA en panne -> plume locale */
    }
  }
  return NextResponse.json({ narration: fallbackNarration(body, fr), ai: false });
}
