/** Types de domaine (vues UI) — partagés web + mobile. */

import type { CategoryKey } from "./categories";

export type Visibility = "public" | "friends" | "private";

export type LocationSharing = "precise" | "approx" | "hidden";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** date de naissance (jamais affichée — sert au verrou 18+ du dating) */
  birthdate?: string | null;
  location_sharing?: LocationSharing;
  /** skin d'anneau gagné via drop (ex: 'gold') */
  ring_skin?: string | null;
  /** mode professionnel 💼 */
  pro_mode?: boolean;
  pro_title?: string | null;
  pro_company?: string | null;
  pro_linkedin?: string | null;
  created_at: string;
}

export interface Place {
  id: string;
  name: string;
  category: CategoryKey;
  address: string | null;
  lat: number;
  lng: number;
  created_at: string;
}

/** Lieu enrichi tel que renvoyé par le RPC `places_nearby`. */
export interface NearbyPlace extends Place {
  distance_m: number;
  active_checkins: number;
}

export interface CheckIn {
  id: string;
  user_id: string;
  place_id: string;
  message: string | null;
  spotify_url?: string | null;
  created_at: string;
  expires_at: string;
  author?: Profile;
  place?: Place;
}

export interface Post {
  id: string;
  user_id: string;
  place_id: string | null;
  body: string | null;
  photo_url: string | null;
  media_type?: "image" | "video";
  visibility: Visibility;
  lat: number | null;
  lng: number | null;
  like_count: number;
  comment_count: number;
  liked_by_me?: boolean;
  created_at: string;
  author?: Profile;
  place?: Place | null;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: Profile;
}

export type ConversationStatus = "pending" | "accepted";

export interface Conversation {
  id: string;
  user_a: string | null;
  user_b: string | null;
  is_group: boolean;
  title: string | null;
  created_by: string | null;
  status: ConversationStatus;
  requested_by: string | null;
  created_at: string;
  last_message_at: string;
  /** 🔥 messages éphémères : off | read (10 s après lu) | 24h */
  ephemeral_mode?: EphemeralMode;
}

export type EphemeralMode = "off" | "read" | "24h";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  poll_id?: string | null;
  created_at: string;
  read_at: string | null;
  /** 🔥 si éphémère : instant de disparition (le client filtre, le cron purge) */
  expires_at?: string | null;
  /** 📸 photo vue unique (snap) */
  view_once?: boolean;
  opened_at?: string | null;
}

export interface PollOption {
  id: string;
  poll_id: string;
  place_id: string | null;
  label: string;
  position: number;
  votes: number;
  myVote: boolean;
  place?: Place | null;
}

export interface PollData {
  id: string;
  conversation_id: string;
  creator_id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
}

export interface ConversationPreview {
  id: string;
  other: Profile | null;
  last_message_at: string;
  lastMessage: Message | null;
  unread: number;
  status: ConversationStatus;
  /** true si c'est MOI qui ai initié la demande */
  iRequested: boolean;
  isGroup: boolean;
  title: string | null;
  /** membres (hors moi) — pour afficher avatars/nom d'un groupe */
  members: Profile[];
}

export interface DatingProfile {
  user_id: string;
  enabled: boolean;
  vibe: string | null;
}

export interface DatingCandidate {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  vibe: string | null;
  /** âge calculé côté base (la date de naissance ne sort jamais) */
  age?: number | null;
  compat?: number;
  /** « On s'est croisés » : lieu + moment du dernier croisement réel */
  crossed_place?: string | null;
  crossed_emoji?: string | null;
  crossed_at?: string | null;
}

/** 🌃 Le Move — statut éphémère « c'est quoi le move ce soir? » */
export interface MyMove {
  body: string;
  emoji: string | null;
  expires_at: string;
}
export interface FriendMove {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  body: string;
  emoji: string | null;
  created_at: string;
}

/** 📈 Sismographe d'ambiance — renvoyé par le RPC city_pulse */
export interface CityPulse {
  series: { h: string; n: number }[];
  live_now: number;
  magnitude: number;
  top_category: string | null;
  top_category_n: number;
}

/** 🌅 Recap du lendemain — renvoyé par le RPC night_recap */
export interface NightRecap {
  night_start: string;
  night_end: string;
  stops: { name: string; category: string; at: string }[];
  crossed: { username: string; display_name: string | null; avatar_url: string | null; place_name: string }[];
  likes: number;
  posts: number;
  matches: number;
}

export interface Story {
  id: string;
  user_id: string;
  place_id: string | null;
  media_url: string;
  media_type?: "image" | "video";
  caption: string | null;
  created_at: string;
  expires_at: string;
  author?: Profile;
  place?: Place | null;
  viewed?: boolean;
}

export interface UserStories {
  author: Profile;
  stories: Story[];
  allViewed: boolean;
}

export type SuggestReason = "co_likes" | "shared_taste" | "fof" | "popular";

export interface SuggestedPerson {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  reason: SuggestReason;
  shared: number;
}

export interface RecommendedPlace extends NearbyPlace {
  reason: "taste" | "popular" | "nearby";
  score: number;
}

export type NotificationType = "follow" | "like" | "comment" | "checkin_join";

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string;
  type: NotificationType;
  post_id: string | null;
  read: boolean;
  created_at: string;
  actor?: Profile;
}
