# Changelog

Toutes les modifications notables de WhosIn sont consignées dans ce fichier.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/).

## [Non publié] - 2026-06-09

### ✨ Fonctionnalités
- Lancement initial de WhosIn : réseau social temps réel géolocalisé (monorepo web Next.js + mobile Expo + Supabase PostGIS).
- Chat de groupe : création de groupes, fil de discussion avec expéditeurs et gestion des membres.
- Section Rencontres (mode détente) : opt-in, deck de découverte, like/pass, et match mutuel ouvrant une conversation.
- Contrôle de visibilité de position : modes approximatif / précis / caché, avec bascule 1 geste sur la carte et option au profil.

### 🔒 Sécurité
- RLS Supabase : appartenance aux groupes protégée par politique de membership.
- RLS Supabase : les « likes » de Rencontres restent privés.
- RLS Supabase : les positions cachées (fantômes) sont invisibles aux autres utilisateurs.

### 🔧 Technique
- Mise en place du monorepo : application web (Next.js), application mobile (Expo) et package partagé.
