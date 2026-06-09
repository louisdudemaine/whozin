# Whozin

**Réseau social temps réel géolocalisé** — voir où sont les gens et partager ce qui se passe en direct (bars, restos, festivals).
*Real-time geolocated social network — see where people are and share what's happening live.*

## Monorepo

```
whos-in/
├── apps/
│   ├── web/        # Next.js 15 (App Router) — PWA installable
│   └── mobile/     # Expo (React Native) — iOS + Android
├── packages/
│   └── shared/     # types, client Supabase, i18n FR/EN, catégories, géo — partagé web + mobile
└── supabase/
    └── migrations/ # schéma PostGIS + RLS
```

## Stack

- **Backend** : Supabase (Postgres 17 + PostGIS), Auth, Realtime, Storage — RLS activé partout
- **Carte** : Mapbox GL JS (web) / @rnmapbox/maps (mobile)
- **Web** : Next.js 15, React 19, Tailwind v4
- **Mobile** : Expo Router, React Native
- **Langues** : FR (prédominant) + EN

## Démarrer (web)

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # remplir les clés
npm run web
```

Variables requises (`apps/web/.env.local`) :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

## Concept

1. **La carte** — tu vois en temps réel les lieux actifs autour de toi et qui y est.
2. **Who's in?** — un check-in temporaire (« je suis ici, qui se joint ? ») qui expire automatiquement.
3. **Le fil** — posts, photos, commentaires sur ce qui se passe maintenant.
4. **Social** — suis tes amis, vois où ils sont, reçois des notifications.

Sécurité : Row Level Security sur toutes les tables ; la position précise n'est jamais exposée publiquement (arrondie / floutée selon la visibilité choisie).
