import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * 🧞 Whozin Genius — concierge de soirée.
 * Croise: goûts (affinité catégories), affluence LIVE, distance, vibes demandées.
 * ANTHROPIC_API_KEY présente -> narration IA (claude-haiku) par-dessus la sélection.
 * Absente -> moteur déterministe seul (même format de réponse).
 */

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface Stop {
  order: number;
  time: string;
  place_id: string;
  name: string;
  category: string;
  active: number;
  why: string;
}

const VIBE_CATS: Record<string, string[]> = {
  manger: ["restaurant", "cafe"],
  danser: ["club", "concert"],
  chill: ["bar", "cafe", "park"],
  festif: ["festival", "event", "concert"],
  sportif: ["sport", "bar"],
};

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "auth requise" }, { status: 401 });

  const supabase = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: u } = await supabase.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ error: "jwt invalide" }, { status: 401 });

  let body: { lat?: number; lng?: number; vibes?: string[]; people?: number; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json invalide" }, { status: 400 });
  }
  const lat = body.lat ?? 45.5019;
  const lng = body.lng ?? -73.5674;
  const vibes = (body.vibes ?? []).filter((v) => v in VIBE_CATS);
  const fr = body.locale !== "en";

  // données: lieux proches + affluence live, et goûts de l'utilisateur
  const [{ data: places }, { data: affinity }] = await Promise.all([
    supabase.rpc("places_nearby", { in_lat: lat, in_lng: lng, radius_m: 8000 }),
    supabase.rpc("my_category_affinity"),
  ]);
  const taste = new Map(
    ((affinity ?? []) as { category: string; score: number }[]).map((a) => [a.category, Number(a.score)])
  );
  const wanted = new Set(vibes.flatMap((v) => VIBE_CATS[v]));

  type P = { id: string; name: string; category: string; distance_m: number; active_checkins: number };
  const scored = ((places ?? []) as P[]).map((p) => ({
    ...p,
    active_checkins: Number(p.active_checkins),
    score:
      (taste.get(p.category) ?? 0) * 2 +
      Number(p.active_checkins) * 3 +
      (wanted.size === 0 || wanted.has(p.category) ? 4 : 0) -
      p.distance_m / 2000,
  }));

  // itinéraire 3 arrêts : manger -> énergie montante -> apothéose
  const pick = (cats: string[], exclude: Set<string>): (P & { score: number }) | null =>
    scored
      .filter((p) => cats.includes(p.category) && !exclude.has(p.id))
      .sort((a, b) => b.score - a.score)[0] ?? null;

  const used = new Set<string>();
  const slots: { time: string; cats: string[]; fallback: string[] }[] = [
    { time: "19h30", cats: ["restaurant", "cafe"], fallback: ["bar"] },
    { time: "21h30", cats: ["bar", "festival", "event"], fallback: ["club", "concert"] },
    { time: "23h30", cats: ["club", "concert"], fallback: ["bar", "festival"] },
  ];

  const stops: Stop[] = [];
  for (const [i, slot] of slots.entries()) {
    const p = pick(slot.cats, used) ?? pick(slot.fallback, used);
    if (!p) continue;
    used.add(p.id);
    stops.push({
      order: i + 1,
      time: slot.time,
      place_id: p.id,
      name: p.name,
      category: p.category,
      active: p.active_checkins,
      why:
        p.active_checkins > 0
          ? fr
            ? `${p.active_checkins} personne(s) y sont déjà — ça bouge`
            : `${p.active_checkins} already there — it's buzzing`
          : (taste.get(p.category) ?? 0) > 0
            ? fr
              ? "Dans tes goûts, selon tes sorties passées"
              : "Matches your taste from past nights"
            : fr
              ? "Coup de cœur du quartier"
              : "Neighbourhood pick",
    });
  }

  if (stops.length === 0) {
    return NextResponse.json({ error: fr ? "rien trouvé autour" : "nothing found nearby" }, { status: 404 });
  }

  // narration IA optionnelle
  let narration: string | null = null;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: `Tu es le concierge de soirée de Whozin (app sociale nightlife à Montréal). En ${fr ? "français québécois" : "English"}, 2-3 phrases max, ton complice et énergique (pas de hashtags), présente cet itinéraire de soirée: ${stops
                .map((s) => `${s.time} ${s.name} (${s.category}${s.active ? `, ${s.active} sur place` : ""})`)
                .join(" → ")}. Vibes demandées: ${vibes.join(", ") || "surprise"}. Groupe de ${body.people ?? 2}.`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        narration = data?.content?.[0]?.text ?? null;
      }
    } catch {
      /* IA en panne -> itinéraire quand même */
    }
  }

  return NextResponse.json({ stops, narration, ai: !!narration });
}
