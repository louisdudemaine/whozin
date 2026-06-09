# Whozin — Mobile (Expo)

App React Native (iOS + Android) partageant le backend Supabase et le package `@whosin/shared` avec le web.

## Démarrer

```bash
# depuis la racine du monorepo
npm install
npm run mobile          # ou: npx expo start --prefix apps/mobile
```

Puis scanner le QR code avec **Expo Go** (iOS/Android).

> ⚠️ La géolocalisation (`expo-location`) fonctionne dans Expo Go. Pour une **carte native plein écran**
> (style Snap Map), ajouter `@maplibre/maplibre-react-native` ou `react-native-maps` — cela requiert un
> **dev build** (`npx expo run:ios` / `run:android`), pas Expo Go. L'écran « Carte » actuel est une liste
> temps réel « autour de toi » (Expo Go), entièrement fonctionnelle.

## Config

Les clés Supabase sont dans `app.json` → `expo.extra` (URL + clé publishable, non secrètes).

## Écrans

- **Carte / Autour de toi** — lieux proches triés par distance + check-ins actifs ; tap → fiche « qui est ici » + bouton *Je suis ici*.
- **Fil** — posts temps réel (like).
- **Profil** — stats + déconnexion.

Auth : email/mot de passe + comptes démo (`aria@whosin.demo` / `whosin123`, etc.).
