import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy Ticketmaster Discovery API — la clé reste côté serveur.
 * Sans TICKETMASTER_API_KEY : repli sur des événements démo (Montréal)
 * pour que la page fonctionne avant le partenariat.
 */

export interface WhozinEvent {
  id: string;
  name: string;
  segment: "music" | "comedy" | "sports" | "arts" | "pro" | "other";
  date: string; // ISO
  venue: string;
  city: string;
  image: string | null;
  url: string | null;
  priceMin: number | null;
  lat: number | null;
  lng: number | null;
}

const TM_SEGMENT: Record<string, WhozinEvent["segment"]> = {
  Music: "music",
  Comedy: "comedy",
  Sports: "sports",
  "Arts & Theatre": "arts",
};

function boundedCoord(value: string | null, fallback: number, min: number, max: number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(fallback);
  return String(Math.min(max, Math.max(min, parsed)));
}

function demoEvents(): WhozinEvent[] {
  const day = 24 * 3600 * 1000;
  const base = Date.now();
  const mk = (
    i: number,
    name: string,
    segment: WhozinEvent["segment"],
    venue: string,
    inDays: number,
    priceMin: number | null,
    seed: string
  ): WhozinEvent => ({
    id: `demo-${i}`,
    name,
    segment,
    date: new Date(base + inDays * day).toISOString(),
    venue,
    city: "Montréal",
    image: `https://picsum.photos/seed/whozin-ev-${seed}/600/338`,
    url: null,
    priceMin,
    lat: null,
    lng: null,
  });
  return [
    mk(1, "Festival de Jazz — Grande scène TD", "music", "Place des Festivals", 0, null, "jazz"),
    mk(2, "Soirée Stand-up : Relève de l'humour", "comedy", "Le Bordel Comédie Club", 1, 25, "standup"),
    mk(3, "DJ set : Nuit Néon", "music", "Stereo Nightclub", 1, 20, "neon"),
    mk(4, "Canadiens vs Bruins", "sports", "Centre Bell", 3, 65, "hockey"),
    mk(5, "Pièce : Les Belles-Sœurs revisitées", "arts", "Théâtre du Nouveau Monde", 4, 38, "theatre"),
    mk(6, "Concert indie : Choses Sauvages", "music", "MTELUS", 5, 32, "indie"),
    mk(7, "Gala d'humour bilingue", "comedy", "Olympia de Montréal", 6, 29, "gala"),
    mk(8, "Match d'impro LNI", "arts", "Club Soda", 7, 18, "impro"),
  ];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = boundedCoord(searchParams.get("lat"), 45.5019, -90, 90);
  const lng = boundedCoord(searchParams.get("lng"), -73.5674, -180, 180);
  const apiKey = process.env.TICKETMASTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ source: "demo", events: demoEvents() });
  }

  try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("latlong", `${lat},${lng}`);
    url.searchParams.set("radius", "30");
    url.searchParams.set("unit", "km");
    url.searchParams.set("size", "40");
    url.searchParams.set("sort", "date,asc");
    url.searchParams.set("locale", "*");

    const res = await fetch(url.toString(), { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`TM ${res.status}`);
    const data = await res.json();

    const events: WhozinEvent[] = (data?._embedded?.events ?? []).map(
      (e: Record<string, any>) => {
        const venue = e._embedded?.venues?.[0];
        const img = (e.images ?? [])
          .filter((i: { width: number }) => i.width >= 500)
          .sort((a: { width: number }, b: { width: number }) => a.width - b.width)[0];
        return {
          id: e.id,
          name: e.name,
          segment:
            TM_SEGMENT[e.classifications?.[0]?.segment?.name as string] ?? "other",
          date: e.dates?.start?.dateTime ?? e.dates?.start?.localDate ?? "",
          venue: venue?.name ?? "",
          city: venue?.city?.name ?? "",
          image: img?.url ?? e.images?.[0]?.url ?? null,
          url: e.url ?? null,
          priceMin: e.priceRanges?.[0]?.min ?? null,
          lat: venue?.location?.latitude ? Number(venue.location.latitude) : null,
          lng: venue?.location?.longitude ? Number(venue.location.longitude) : null,
        };
      }
    );
    return NextResponse.json({ source: "ticketmaster", events });
  } catch {
    // panne TM -> on dégrade proprement sur la démo
    return NextResponse.json({ source: "demo", events: demoEvents() });
  }
}
