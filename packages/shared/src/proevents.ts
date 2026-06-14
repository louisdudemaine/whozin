/** 💼 Types d'événements professionnels (segment 'pro'). */

export interface ProEventType {
  key: string;
  emoji: string;
  fr: string;
  en: string;
}

export const PRO_EVENT_TYPES: ProEventType[] = [
  { key: "5a7", emoji: "🥂", fr: "5 à 7", en: "Happy hour" },
  { key: "conference", emoji: "🎤", fr: "Conférence", en: "Conference" },
  { key: "atelier", emoji: "🛠️", fr: "Atelier", en: "Workshop" },
  { key: "panel", emoji: "🗣️", fr: "Panel / Table ronde", en: "Panel" },
  { key: "lancement", emoji: "🚀", fr: "Lancement", en: "Launch" },
  { key: "salon", emoji: "🏛️", fr: "Salon / Expo", en: "Trade show" },
  { key: "dejeuner", emoji: "🍳", fr: "Déjeuner d'affaires", en: "Business breakfast" },
  { key: "pitch", emoji: "💰", fr: "Pitch / Investisseurs", en: "Pitch night" },
  { key: "formation", emoji: "🎓", fr: "Formation", en: "Training" },
  { key: "mixer", emoji: "🤝", fr: "Mixer / Réseautage", en: "Networking mixer" },
];

export function getProEventType(key: string | null | undefined): ProEventType | null {
  return PRO_EVENT_TYPES.find((t) => t.key === key) ?? null;
}
