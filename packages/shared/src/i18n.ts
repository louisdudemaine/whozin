/** i18n FR/EN — partagé web + mobile. FR prédominant (marché QC). */

export type Locale = "fr" | "en";
export const LOCALES: Locale[] = ["fr", "en"];
export const DEFAULT_LOCALE: Locale = "fr";

export const messages = {
  fr: {
    appName: "Whozin",
    tagline: "Vois ce qui se passe. Maintenant.",
    nav: { map: "Carte", feed: "Fil", create: "Partager", notifications: "Notifs", profile: "Profil" },
    auth: {
      signIn: "Se connecter",
      signUp: "Créer un compte",
      signOut: "Se déconnecter",
      email: "Courriel",
      password: "Mot de passe",
      username: "Nom d'utilisateur",
      displayName: "Nom affiché",
      continue: "Continuer",
      haveAccount: "Déjà un compte ?",
      noAccount: "Pas encore de compte ?",
      checkEmail: "Vérifie tes courriels pour confirmer ton compte.",
      welcome: "Bienvenue sur Whozin",
      welcomeSub: "Connecte-toi pour voir qui est sorti ce soir.",
    },
    map: {
      title: "Autour de toi",
      whoIsHere: "Qui est ici",
      nobodyYet: "Personne pour l'instant — sois le premier !",
      activeNow: "actif·ve maintenant",
      activePlaces: "lieux actifs",
      locating: "Localisation…",
      locationDenied: "Active la géolocalisation pour voir ce qui se passe autour de toi.",
      recenter: "Me recentrer",
    },
    checkin: {
      title: "Who's in ?",
      cta: "Je suis ici",
      here: "Tu es ici",
      placeholder: "Quoi de neuf ? (optionnel)",
      post: "Publier",
      leave: "Je pars",
      expiresIn: "expire dans",
      peopleHere: "personnes ici",
      join: "Je me joins",
    },
    feed: {
      title: "Ce qui se passe",
      empty: "Rien pour l'instant. Sois le premier à partager !",
      now: "à l'instant",
      comment: "Commenter",
      comments: "commentaires",
      like: "J'aime",
      likes: "j'aime",
      writeComment: "Écris un commentaire…",
    },
    create: {
      title: "Partager un moment",
      whereAreYou: "Où es-tu ?",
      whatsHappening: "Qu'est-ce qui se passe ?",
      addPhoto: "Ajouter une photo",
      visibility: "Visibilité",
      publish: "Publier",
      selectPlace: "Choisir un lieu",
    },
    visibility: { public: "Public", friends: "Amis", private: "Privé" },
    profile: {
      followers: "abonnés",
      following: "abonnements",
      checkins: "check-ins",
      follow: "Suivre",
      unfollow: "Ne plus suivre",
      editProfile: "Modifier le profil",
      bio: "Bio",
      noActivity: "Aucune activité pour l'instant.",
    },
    notifications: {
      title: "Notifications",
      empty: "Aucune notification.",
      followed: "a commencé à te suivre",
      liked: "a aimé ta publication",
      commented: "a commenté ta publication",
      joinedCheckin: "s'est joint·e à toi",
    },
    common: {
      loading: "Chargement…",
      retry: "Réessayer",
      cancel: "Annuler",
      save: "Enregistrer",
      error: "Une erreur est survenue.",
      ago: "il y a",
      min: "min",
      h: "h",
      j: "j",
    },
  },
  en: {
    appName: "Whozin",
    tagline: "See what's happening. Right now.",
    nav: { map: "Map", feed: "Feed", create: "Share", notifications: "Alerts", profile: "Profile" },
    auth: {
      signIn: "Sign in",
      signUp: "Sign up",
      signOut: "Sign out",
      email: "Email",
      password: "Password",
      username: "Username",
      displayName: "Display name",
      continue: "Continue",
      haveAccount: "Already have an account?",
      noAccount: "No account yet?",
      checkEmail: "Check your email to confirm your account.",
      welcome: "Welcome to Whozin",
      welcomeSub: "Sign in to see who's out tonight.",
    },
    map: {
      title: "Around you",
      whoIsHere: "Who's here",
      nobodyYet: "Nobody yet — be the first!",
      activeNow: "active now",
      activePlaces: "active places",
      locating: "Locating…",
      locationDenied: "Enable location to see what's happening around you.",
      recenter: "Recenter",
    },
    checkin: {
      title: "Who's in?",
      cta: "I'm here",
      here: "You're here",
      placeholder: "What's up? (optional)",
      post: "Post",
      leave: "I'm leaving",
      expiresIn: "expires in",
      peopleHere: "people here",
      join: "I'm in",
    },
    feed: {
      title: "What's happening",
      empty: "Nothing yet. Be the first to share!",
      now: "just now",
      comment: "Comment",
      comments: "comments",
      like: "Like",
      likes: "likes",
      writeComment: "Write a comment…",
    },
    create: {
      title: "Share a moment",
      whereAreYou: "Where are you?",
      whatsHappening: "What's happening?",
      addPhoto: "Add a photo",
      visibility: "Visibility",
      publish: "Publish",
      selectPlace: "Pick a place",
    },
    visibility: { public: "Public", friends: "Friends", private: "Private" },
    profile: {
      followers: "followers",
      following: "following",
      checkins: "check-ins",
      follow: "Follow",
      unfollow: "Unfollow",
      editProfile: "Edit profile",
      bio: "Bio",
      noActivity: "No activity yet.",
    },
    notifications: {
      title: "Notifications",
      empty: "No notifications.",
      followed: "started following you",
      liked: "liked your post",
      commented: "commented on your post",
      joinedCheckin: "joined you",
    },
    common: {
      loading: "Loading…",
      retry: "Retry",
      cancel: "Cancel",
      save: "Save",
      error: "Something went wrong.",
      ago: "",
      min: "min",
      h: "h",
      j: "d",
    },
  },
} as const;

export type Messages = (typeof messages)["fr"];

export function getMessages(locale: Locale): Messages {
  return (messages[locale] ?? messages[DEFAULT_LOCALE]) as Messages;
}

/** Temps relatif bilingue compact (« il y a 5 min » / « 5 min ago »). */
export function timeAgo(date: string | Date, locale: Locale = "fr"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  const m = getMessages(locale).common;
  if (sec < 60) return locale === "fr" ? "à l'instant" : "just now";
  const mins = Math.floor(sec / 60);
  if (mins < 60) return locale === "fr" ? `il y a ${mins} ${m.min}` : `${mins} ${m.min} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return locale === "fr" ? `il y a ${hrs} ${m.h}` : `${hrs} ${m.h} ago`;
  const days = Math.floor(hrs / 24);
  return locale === "fr" ? `il y a ${days} ${m.j}` : `${days} ${m.j} ago`;
}
