/** Types de domaine (vues UI) — partagés web + mobile. */

import type { CategoryKey } from "./categories";

export type Visibility = "public" | "friends" | "private";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
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
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  read_at: string | null;
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
