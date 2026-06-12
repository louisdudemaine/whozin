"use client";

/**
 * 💬 Icebreakers de lieu — brise-glace contextuels, jamais cringe.
 * Déterministes par conversation (hash du seed) pour rester stables au re-render.
 */

type Lang = { fr: string[]; en: string[] };

// {place} est remplacé par le nom du lieu
const BY_CATEGORY: Record<string, Lang> = {
  bar: {
    fr: [
      "Le DJ du {place} est-tu si bon que ça? 🍻",
      "T'es au {place}? Dis-moi que la file est moins pire qu'avant",
      "Verdict honnête sur le {place} ce soir : ça vaut le détour?",
    ],
    en: [
      "Is the DJ at {place} actually that good? 🍻",
      "You're at {place}? Tell me the line got shorter",
      "Honest verdict on {place} tonight: worth the trip?",
    ],
  },
  restaurant: {
    fr: [
      "OK j'avoue, c'est quoi le plat à commander au {place}? 🍽️",
      "Le {place}… surcoté ou légendaire? J'ai besoin de savoir",
      "Si je me pointe au {place} là, je commande quoi?",
    ],
    en: [
      "OK real talk, what's THE dish at {place}? 🍽️",
      "{place}… overrated or legendary? I need to know",
      "If I show up at {place} right now, what do I order?",
    ],
  },
  cafe: {
    fr: [
      "Meilleur café du {place}? Je prends des notes ☕",
      "T'es au {place} — coin tranquille ou plein à craquer?",
      "Dis-moi que le {place} a encore des croissants 🥐",
    ],
    en: [
      "Best drink at {place}? Taking notes ☕",
      "You're at {place} — quiet corner or packed?",
      "Please tell me {place} still has croissants 🥐",
    ],
  },
  club: {
    fr: [
      "Ça danse vraiment au {place} ou c'est juste du monde sur leur tel? 🪩",
      "Le drop au {place} — j'ai besoin d'un rapport en direct",
      "Échelle de 1 à 10, l'ambiance au {place} là?",
    ],
    en: [
      "Is {place} actually dancing or just people on their phones? 🪩",
      "The drop at {place} — I need a live report",
      "Scale of 1 to 10, the vibe at {place} right now?",
    ],
  },
  festival: {
    fr: [
      "T'es au {place}?! C'est qui le meilleur act jusqu'à date? 🎪",
      "Vaut-tu la peine que je traverse la ville pour le {place}?",
      "Photo de la foule au {place} ou ça compte pas 😄",
    ],
    en: [
      "You're at {place}?! Best act so far? 🎪",
      "Is {place} worth crossing the city for?",
      "Crowd pic at {place} or it didn't happen 😄",
    ],
  },
  concert: {
    fr: [
      "Le son au {place} est-tu correct ce soir? 🎶",
      "Setlist du {place} — y'ont-tu joué LA toune?",
      "Jaloux·se que tu sois au {place}. Raconte.",
    ],
    en: [
      "How's the sound at {place} tonight? 🎶",
      "Setlist check at {place} — did they play THE song?",
      "So jealous you're at {place}. Tell me everything.",
    ],
  },
  sport: {
    fr: [
      "C'est quoi le score au {place}?! 🏟️",
      "L'ambiance au {place} a l'air folle — c'est tendu?",
      "T'es au {place}? Dis-moi qu'on gagne",
    ],
    en: [
      "What's the score at {place}?! 🏟️",
      "The vibe at {place} looks wild — is it tense?",
      "You're at {place}? Tell me we're winning",
    ],
  },
  park: {
    fr: [
      "Le {place} au coucher de soleil, bonne idée ou monde partout? 🌳",
      "T'es au {place}? Il fait-tu encore beau dehors?",
      "Spot tranquille au {place} à recommander?",
    ],
    en: [
      "{place} at sunset, good call or packed? 🌳",
      "You're at {place}? Still nice out?",
      "Any quiet spot at {place} you'd recommend?",
    ],
  },
  event: {
    fr: [
      "C'est quoi le vibe au {place}? 🎉",
      "Ça vaut-tu le déplacement, le {place}?",
      "T'es au {place} — c'est aussi cool que ça en a l'air?",
    ],
    en: [
      "What's the vibe at {place}? 🎉",
      "Is {place} worth the trip?",
      "You're at {place} — as cool as it looks?",
    ],
  },
};

const GENERIC: Lang = {
  fr: [
    "Heille! Ton spot a l'air pas mal mieux que mon divan 👋",
    "On s'est croisés sur Whozin — c'est quoi ton QG en ville?",
    "Sondage sérieux : meilleure soirée à MTL, tu dis quoi?",
    "T'as l'air de connaître les bons spots — je prends les recommandations 📍",
  ],
  en: [
    "Hey! Your spot looks way better than my couch 👋",
    "We crossed on Whozin — what's your HQ in the city?",
    "Serious poll: best night out in MTL, what's your pick?",
    "You seem to know the good spots — I'll take recommendations 📍",
  ],
};

/** hash déterministe simple (stable au re-render, varie par conversation) */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function icebreakers(opts: {
  category?: string | null;
  place?: string | null;
  locale: "fr" | "en";
  seed: string;
}): string[] {
  const pool =
    opts.category && opts.place && BY_CATEGORY[opts.category]
      ? BY_CATEGORY[opts.category][opts.locale].map((l) => l.replace(/\{place\}/g, opts.place!))
      : GENERIC[opts.locale];
  const start = hash(opts.seed) % pool.length;
  return [0, 1, 2].map((i) => pool[(start + i) % pool.length]).slice(0, Math.min(3, pool.length));
}
