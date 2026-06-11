"use client";

import type {
  AppNotification,
  CheckIn,
  Comment,
  Conversation,
  ConversationPreview,
  DatingCandidate,
  DatingProfile,
  Message,
  NearbyPlace,
  Place,
  Post,
  Profile,
} from "@whosin/shared";
import { getSupabase } from "./supabase";

const PROFILE_COLS = "id,username,display_name,avatar_url,bio,created_at";

/** Lieux proches d'un centre (RPC PostGIS). */
export async function fetchNearby(
  lat: number,
  lng: number,
  radiusM = 8000
): Promise<NearbyPlace[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("places_nearby", {
    in_lat: lat,
    in_lng: lng,
    radius_m: radiusM,
  });
  if (error) throw error;
  return (data ?? []).map((p: Record<string, unknown>) => ({
    ...(p as unknown as NearbyPlace),
    active_checkins: Number((p as { active_checkins: number }).active_checkins ?? 0),
  }));
}

/** Check-ins actifs à un lieu, avec auteur. */
export async function fetchCheckIns(placeId: string): Promise<CheckIn[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("check_ins")
    .select(`*, author:profiles!check_ins_user_id_fkey(${PROFILE_COLS})`)
    .eq("place_id", placeId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as CheckIn[]) ?? [];
}

/** Check-ins actifs (tous lieux) pour la rangée de stories « EN DIRECT » — 1 par personne. */
export async function fetchActiveCheckIns(limit = 30): Promise<CheckIn[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("check_ins")
    .select(`*, author:profiles!check_ins_user_id_fkey(${PROFILE_COLS}), place:places(*)`)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data as unknown as CheckIn[]) ?? [];
  const seen = new Set<string>();
  return rows.filter((c) => (seen.has(c.user_id) ? false : (seen.add(c.user_id), true)));
}

/** Posts avec photo pour la grille Explorer. */
export async function fetchExplore(limit = 60): Promise<Post[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("post_feed")
    .select("*")
    .not("photo_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return stitchPosts((data ?? []) as Post[]);
}

/** Mes check-ins actifs. */
export async function fetchMyActiveCheckIns(userId: string): Promise<CheckIn[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("check_ins")
    .select("*, place:places(*)")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return (data as unknown as CheckIn[]) ?? [];
}

export async function checkIn(
  userId: string,
  placeId: string,
  message: string | null,
  lat?: number,
  lng?: number,
  spotifyUrl?: string | null
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("check_ins").insert({
    user_id: userId,
    place_id: placeId,
    message: message || null,
    lat: lat ?? null,
    lng: lng ?? null,
    spotify_url: spotifyUrl || null,
  });
  if (error) throw error;
}

export async function leaveCheckIn(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("check_ins").delete().eq("id", id);
  if (error) throw error;
}

/** Crée un lieu (si l'utilisateur partage depuis une position libre). */
export async function createPlace(
  userId: string,
  name: string,
  category: string,
  lat: number,
  lng: number,
  address?: string
): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("places")
    .insert({ name, category, lat, lng, address: address ?? null, created_by: userId })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Fil d'activité (post_feed view) + stitching auteur/lieu. */
export async function fetchFeed(limit = 50): Promise<Post[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("post_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Post[];
  return stitchPosts(rows);
}

export async function fetchUserPosts(userId: string): Promise<Post[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("post_feed")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return stitchPosts((data ?? []) as Post[]);
}

async function stitchPosts(rows: Post[]): Promise<Post[]> {
  if (rows.length === 0) return [];
  const supabase = getSupabase();
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const placeIds = [...new Set(rows.map((r) => r.place_id).filter(Boolean))] as string[];

  const [{ data: profiles }, placesRes] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLS).in("id", userIds),
    placeIds.length
      ? supabase.from("places").select("*").in("id", placeIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const pById = new Map((profiles ?? []).map((p) => [(p as Profile).id, p as Profile]));
  const plById = new Map(
    ((placesRes.data ?? []) as { id: string }[]).map((p) => [p.id, p])
  );

  return rows.map((r) => ({
    ...r,
    like_count: Number(r.like_count ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    author: pById.get(r.user_id),
    place: r.place_id ? (plById.get(r.place_id) as Post["place"]) ?? null : null,
  }));
}

export async function createPost(
  userId: string,
  body: string,
  placeId: string | null,
  visibility: "public" | "friends" | "private",
  lat: number | null,
  lng: number | null,
  photoUrl: string | null
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("posts").insert({
    user_id: userId,
    body: body || null,
    place_id: placeId,
    visibility,
    lat,
    lng,
    photo_url: photoUrl,
  });
  if (error) throw error;
}

export async function toggleLike(postId: string, userId: string, liked: boolean) {
  const supabase = getSupabase();
  if (liked) {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: userId });
    if (error) throw error;
  }
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("comments")
    .select(`*, author:profiles!comments_user_id_fkey(${PROFILE_COLS})`)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as Comment[]) ?? [];
}

export async function addComment(postId: string, userId: string, body: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    user_id: userId,
    body,
  });
  if (error) throw error;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("notifications")
    .select(`*, actor:profiles!notifications_actor_id_fkey(${PROFILE_COLS})`)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data as unknown as AppNotification[]) ?? [];
}

export async function markNotificationsRead(): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("notifications").update({ read: true }).eq("read", false);
}

export async function unreadCount(): Promise<number> {
  const supabase = getSupabase();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);
  return count ?? 0;
}

// ----- Recommandations -----

export async function fetchSuggestedPeople(lim = 12): Promise<import("@whosin/shared").SuggestedPerson[]> {
  const supabase = getSupabase();
  const { data } = await supabase.rpc("suggested_people", { lim });
  let rows = (data ?? []) as import("@whosin/shared").SuggestedPerson[];
  if (rows.length === 0) {
    const { data: pop } = await supabase.rpc("popular_people", { lim });
    rows = (pop ?? []) as import("@whosin/shared").SuggestedPerson[];
  }
  return rows;
}

export async function fetchRecommendedPlaces(
  lat: number,
  lng: number,
  lim = 12
): Promise<import("@whosin/shared").RecommendedPlace[]> {
  const { data, error } = await getSupabase().rpc("recommended_places", {
    in_lat: lat,
    in_lng: lng,
    lim,
  });
  if (error) throw error;
  return (data ?? []).map((p: Record<string, unknown>) => ({
    ...(p as unknown as import("@whosin/shared").RecommendedPlace),
    active_checkins: Number((p as { active_checkins: number }).active_checkins ?? 0),
  }));
}

// ----- Profils & social -----

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("username", username)
    .maybeSingle();
  return (data as Profile) ?? null;
}

export interface ProfileStats {
  followers: number;
  following: number;
  checkins: number;
  isFollowing: boolean;
}

export async function fetchProfileStats(
  profileId: string,
  viewerId: string | null
): Promise<ProfileStats> {
  const supabase = getSupabase();
  const [followers, following, checkins, isFollowing] = await Promise.all([
    supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profileId),
    supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profileId),
    supabase.from("check_ins").select("id", { count: "exact", head: true }).eq("user_id", profileId),
    viewerId
      ? supabase
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("follower_id", viewerId)
          .eq("following_id", profileId)
      : Promise.resolve({ count: 0 }),
  ]);
  return {
    followers: followers.count ?? 0,
    following: following.count ?? 0,
    checkins: checkins.count ?? 0,
    isFollowing: (isFollowing.count ?? 0) > 0,
  };
}

/** Les profils que `meId` suit (candidats pour un groupe). */
export async function fetchFollowing(meId: string): Promise<Profile[]> {
  const supabase = getSupabase();
  const { data: rows } = await supabase.from("follows").select("following_id").eq("follower_id", meId);
  const ids = ((rows ?? []) as { following_id: string }[]).map((r) => r.following_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from("profiles").select(PROFILE_COLS).in("id", ids);
  return (profiles ?? []) as Profile[];
}

export async function follow(followerId: string, followingId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: followerId, following_id: followingId });
  if (error) throw error;
}

export async function unfollow(followerId: string, followingId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);
  if (error) throw error;
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, "display_name" | "bio" | "avatar_url" | "username">>
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

export async function updateLocationSharing(
  meId: string,
  value: "precise" | "approx" | "hidden"
): Promise<void> {
  const { error } = await getSupabase()
    .from("profiles")
    .update({ location_sharing: value })
    .eq("id", meId);
  if (error) throw error;
}

// ----- Portail partenaire 🏪 -----

export interface PartnerPlace {
  place_id: string;
  business_name: string | null;
  place?: Place;
}

export async function fetchMyPartnerPlace(meId: string): Promise<PartnerPlace | null> {
  const { data } = await getSupabase()
    .from("place_partners")
    .select("place_id,business_name,place:places(*)")
    .eq("user_id", meId)
    .maybeSingle();
  return (data as unknown as PartnerPlace) ?? null;
}

export async function claimPlace(meId: string, placeId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("place_partners")
    .insert({ place_id: placeId, user_id: meId });
  if (error) throw error;
}

export interface PartnerStats {
  active_now: number;
  checkins_30d: number;
  uniques_30d: number;
  peak_hour: number | null;
}

export async function fetchPartnerStats(placeId: string): Promise<PartnerStats | null> {
  const { data } = await getSupabase().rpc("partner_place_stats", { p_place: placeId });
  const r = (data as PartnerStats[] | null)?.[0];
  return r
    ? {
        active_now: Number(r.active_now),
        checkins_30d: Number(r.checkins_30d),
        uniques_30d: Number(r.uniques_30d),
        peak_hour: r.peak_hour,
      }
    : null;
}

export interface PartnerEvent {
  id: string;
  place_id: string;
  title: string;
  description: string | null;
  segment: string;
  starts_at: string;
  price_min: number | null;
  ticket_url: string | null;
  place?: Place;
}

export async function createPartnerEvent(
  meId: string,
  placeId: string,
  ev: { title: string; description?: string; segment: string; starts_at: string; price_min?: number | null; ticket_url?: string | null }
): Promise<void> {
  const { error } = await getSupabase().from("partner_events").insert({
    place_id: placeId,
    creator_id: meId,
    title: ev.title,
    description: ev.description || null,
    segment: ev.segment,
    starts_at: ev.starts_at,
    price_min: ev.price_min ?? null,
    ticket_url: ev.ticket_url || null,
  });
  if (error) throw error;
}

export async function fetchPartnerEvents(placeId?: string): Promise<PartnerEvent[]> {
  let q = getSupabase()
    .from("partner_events")
    .select("*, place:places(*)")
    .gt("starts_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order("starts_at", { ascending: true });
  if (placeId) q = q.eq("place_id", placeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as PartnerEvent[]) ?? [];
}

export async function deletePartnerEvent(eventId: string): Promise<void> {
  await getSupabase().from("partner_events").delete().eq("id", eventId);
}

// ----- Drops géolocalisés 🎁 -----

export interface PlaceDrop {
  id: string;
  name: string;
  emoji: string;
  kind: "badge" | "ring_skin";
  skin: string | null;
  claimed: boolean;
}

export async function fetchPlaceDrop(placeId: string, meId: string): Promise<PlaceDrop | null> {
  const supabase = getSupabase();
  const { data: drop } = await supabase
    .from("drops")
    .select("id,name,emoji,kind,skin")
    .eq("place_id", placeId)
    .maybeSingle();
  if (!drop) return null;
  const { count } = await supabase
    .from("drop_claims")
    .select("drop_id", { count: "exact", head: true })
    .eq("drop_id", (drop as { id: string }).id)
    .eq("user_id", meId);
  return { ...(drop as Omit<PlaceDrop, "claimed">), claimed: (count ?? 0) > 0 };
}

export async function claimDrop(dropId: string): Promise<{ name: string; emoji: string }> {
  const { data, error } = await getSupabase().rpc("claim_drop", { d_id: dropId });
  if (error) throw error;
  return data as { name: string; emoji: string };
}

export interface MyDrop {
  name: string;
  emoji: string;
  kind: string;
  skin: string | null;
  claimed_at: string;
  place_name: string;
}

export async function fetchMyDrops(): Promise<MyDrop[]> {
  const { data } = await getSupabase().rpc("my_drops");
  return (data ?? []) as MyDrop[];
}

// ----- Prédiction d'affluence 🔮 -----

export interface PlaceForecast {
  peak_hour: number;
  confidence: number;
  samples: number;
}

export async function fetchPlaceForecast(placeId: string): Promise<PlaceForecast | null> {
  const { data } = await getSupabase().rpc("place_forecast", { p_place: placeId });
  const row = (data as PlaceForecast[] | null)?.[0];
  if (!row || Number(row.samples) < 4) return null; // pas assez d'historique = pas de prédiction
  return { ...row, samples: Number(row.samples) };
}

// ----- Vu IRL ✓ + Memories 📸 -----

/** Co-présence vérifiée (n'importe quand) entre moi et `other`. */
export async function fetchSeenIrl(otherId: string): Promise<boolean> {
  const { data } = await getSupabase().rpc("seen_irl", { other: otherId });
  return !!data;
}

export interface PlaceMemory {
  last_at: string;
  with_names: string[];
}

/** Ma dernière fois à ce lieu (>12 h) + amis co-présents ce soir-là. */
export async function fetchPlaceMemory(placeId: string): Promise<PlaceMemory | null> {
  const { data } = await getSupabase().rpc("place_memory", { p_place: placeId });
  const row = (data as PlaceMemory[] | null)?.[0];
  return row?.last_at ? row : null;
}

// ----- Mode Balise 🔦 -----

export interface ActiveBeacon {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  message: string | null;
  expires_at: string;
  conversation_id: string | null;
  responses: number;
  i_responded: boolean;
}

export async function fetchActiveBeacons(): Promise<ActiveBeacon[]> {
  const { data, error } = await getSupabase().rpc("active_beacons");
  if (error) throw error;
  return ((data ?? []) as ActiveBeacon[]).map((b) => ({ ...b, responses: Number(b.responses) }));
}

export async function launchBeacon(meId: string, message: string | null): Promise<string> {
  const { data, error } = await getSupabase()
    .from("beacons")
    .insert({ user_id: meId, message })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function extinguishBeacon(beaconId: string): Promise<void> {
  await getSupabase().from("beacons").delete().eq("id", beaconId);
}

export async function respondBeacon(
  beaconId: string
): Promise<{ responses: number; conversation_id: string | null }> {
  const { data, error } = await getSupabase().rpc("respond_beacon", { b_id: beaconId });
  if (error) throw error;
  const r = data as { responses: number; conversation_id: string | null };
  return { responses: Number(r.responses), conversation_id: r.conversation_id ?? null };
}

/** Amis mutuels (follow dans les deux sens). */
export async function fetchMutuals(meId: string): Promise<Profile[]> {
  const supabase = getSupabase();
  const [{ data: fol }, { data: ing }] = await Promise.all([
    supabase.from("follows").select("follower_id").eq("following_id", meId),
    supabase.from("follows").select("following_id").eq("follower_id", meId),
  ]);
  const followers = new Set(((fol ?? []) as { follower_id: string }[]).map((r) => r.follower_id));
  const ids = ((ing ?? []) as { following_id: string }[])
    .map((r) => r.following_id)
    .filter((id) => followers.has(id));
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from("profiles").select(PROFILE_COLS).in("id", ids);
  return (profiles ?? []) as Profile[];
}

// ----- Mode Proximité 📡 -----

export async function upsertLivePosition(meId: string, lat: number, lng: number): Promise<void> {
  await getSupabase()
    .from("live_positions")
    .upsert({ user_id: meId, lat, lng, updated_at: new Date().toISOString() });
}

export interface NearbyFriend {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bucket: "ici" | "proche";
}

export async function fetchFriendsNearby(): Promise<NearbyFriend[]> {
  const { data, error } = await getSupabase().rpc("friends_nearby");
  if (error) throw error;
  return (data ?? []) as NearbyFriend[];
}

// ----- Sondages « On va où? » -----

export async function createPoll(
  convId: string,
  meId: string,
  question: string,
  options: { placeId: string | null; label: string }[]
): Promise<string> {
  const supabase = getSupabase();
  const { data: poll, error } = await supabase
    .from("polls")
    .insert({ conversation_id: convId, creator_id: meId, question })
    .select("id")
    .single();
  if (error) throw error;
  const pollId = (poll as { id: string }).id;
  const { error: e2 } = await supabase.from("poll_options").insert(
    options.map((o, i) => ({ poll_id: pollId, place_id: o.placeId, label: o.label, position: i }))
  );
  if (e2) throw e2;
  const { error: e3 } = await supabase
    .from("messages")
    .insert({ conversation_id: convId, sender_id: meId, body: null, poll_id: pollId });
  if (e3) throw e3;
  return pollId;
}

export async function fetchPoll(pollId: string, meId: string): Promise<import("@whosin/shared").PollData | null> {
  const supabase = getSupabase();
  const [{ data: poll }, { data: opts }, { data: votes }] = await Promise.all([
    supabase.from("polls").select("*").eq("id", pollId).maybeSingle(),
    supabase.from("poll_options").select("*, place:places(*)").eq("poll_id", pollId).order("position"),
    supabase.from("poll_votes").select("option_id,user_id").eq("poll_id", pollId),
  ]);
  if (!poll) return null;
  const voteRows = (votes ?? []) as { option_id: string; user_id: string }[];
  const options = ((opts ?? []) as Record<string, unknown>[]).map((o) => ({
    ...(o as unknown as import("@whosin/shared").PollOption),
    votes: voteRows.filter((v) => v.option_id === (o as { id: string }).id).length,
    myVote: voteRows.some((v) => v.option_id === (o as { id: string }).id && v.user_id === meId),
  }));
  return {
    ...(poll as Omit<import("@whosin/shared").PollData, "options" | "totalVotes">),
    options,
    totalVotes: voteRows.length,
  };
}

export async function votePoll(pollId: string, optionId: string, meId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("poll_votes")
    .upsert({ poll_id: pollId, option_id: optionId, user_id: meId }, { onConflict: "poll_id,user_id" });
  if (error) throw error;
}

// ----- Squads (invitations) -----

export async function createSquadInvite(convId: string, meId: string): Promise<string> {
  const { data, error } = await getSupabase()
    .from("squad_invites")
    .insert({ conversation_id: convId, inviter_id: meId })
    .select("code")
    .single();
  if (error) throw error;
  return (data as { code: string }).code;
}

export async function joinSquad(code: string): Promise<{ conversation_id: string; title: string }> {
  const { data, error } = await getSupabase().rpc("join_squad", { invite_code: code });
  if (error) throw error;
  return data as { conversation_id: string; title: string };
}

// ----- Stories 24h -----

/** Stories actives groupées par auteur (moi en premier, puis non-vues, puis vues). */
export async function fetchStories(meId: string): Promise<import("@whosin/shared").UserStories[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("stories")
    .select(`*, author:profiles!stories_user_id_fkey(${PROFILE_COLS}), place:places(*)`)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;
  const stories = (data as unknown as import("@whosin/shared").Story[]) ?? [];
  if (stories.length === 0) return [];

  const { data: views } = await supabase
    .from("story_views")
    .select("story_id")
    .eq("viewer_id", meId)
    .in("story_id", stories.map((s) => s.id));
  const seen = new Set(((views ?? []) as { story_id: string }[]).map((v) => v.story_id));

  const byUser = new Map<string, import("@whosin/shared").UserStories>();
  for (const s of stories) {
    if (!s.author) continue;
    s.viewed = seen.has(s.id) || s.user_id === meId;
    const g = byUser.get(s.user_id) ?? { author: s.author, stories: [], allViewed: true };
    g.stories.push(s);
    if (!s.viewed) g.allViewed = false;
    byUser.set(s.user_id, g);
  }
  return [...byUser.values()].sort((a, b) => {
    if (a.author.id === meId) return -1;
    if (b.author.id === meId) return 1;
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    return 0;
  });
}

export async function markStoryViewed(storyId: string, meId: string): Promise<void> {
  await getSupabase()
    .from("story_views")
    .upsert({ story_id: storyId, viewer_id: meId }, { ignoreDuplicates: true });
}

export async function publishStory(
  meId: string,
  mediaUrl: string,
  caption: string | null,
  placeId: string | null
): Promise<void> {
  const { error } = await getSupabase().from("stories").insert({
    user_id: meId,
    media_url: mediaUrl,
    caption: caption || null,
    place_id: placeId,
  });
  if (error) throw error;
}

export async function storyViewerCount(storyId: string): Promise<number> {
  const { count } = await getSupabase()
    .from("story_views")
    .select("viewer_id", { count: "exact", head: true })
    .eq("story_id", storyId);
  return count ?? 0;
}

// ----- Blocage & signalement -----

export async function blockUser(meId: string, targetId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("blocks")
    .insert({ blocker_id: meId, blocked_id: targetId });
  if (error && !`${error.code}`.startsWith("23")) throw error; // doublon = ok
}

export async function unblockUser(meId: string, targetId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("blocks")
    .delete()
    .eq("blocker_id", meId)
    .eq("blocked_id", targetId);
  if (error) throw error;
}

/** true si MOI j'ai bloqué cette personne. */
export async function iBlocked(meId: string, targetId: string): Promise<boolean> {
  const { count } = await getSupabase()
    .from("blocks")
    .select("blocked_id", { count: "exact", head: true })
    .eq("blocker_id", meId)
    .eq("blocked_id", targetId);
  return (count ?? 0) > 0;
}

export async function reportTarget(
  reporterId: string,
  targetType: "profile" | "post" | "message" | "story",
  targetId: string,
  reason: string
): Promise<void> {
  const { error } = await getSupabase().from("reports").insert({
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    reason,
  });
  if (error) throw error;
}

// ----- Rencontres (dating) -----

export async function fetchDatingProfile(meId: string): Promise<DatingProfile | null> {
  const { data } = await getSupabase()
    .from("dating_profiles")
    .select("user_id,enabled,vibe")
    .eq("user_id", meId)
    .maybeSingle();
  return (data as DatingProfile) ?? null;
}

export async function upsertDatingProfile(meId: string, enabled: boolean, vibe: string): Promise<void> {
  const { error } = await getSupabase()
    .from("dating_profiles")
    .upsert({ user_id: meId, enabled, vibe: vibe || null, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function fetchDatingCandidates(lim = 30): Promise<DatingCandidate[]> {
  const { data, error } = await getSupabase().rpc("dating_candidates", { lim });
  if (error) throw error;
  return (data ?? []) as DatingCandidate[];
}

export async function datingLike(
  target: string
): Promise<{ matched: boolean; conversation_id: string | null }> {
  const { data, error } = await getSupabase().rpc("dating_like", { target });
  if (error) throw error;
  const r = (data ?? {}) as { matched?: boolean; conversation_id?: string | null };
  return { matched: !!r.matched, conversation_id: r.conversation_id ?? null };
}

// ----- Messagerie directe -----

/** Ouvre (ou crée) une conversation avec un autre utilisateur, renvoie son id. */
export async function getOrCreateConversation(otherId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_or_create_conversation", { other: otherId });
  if (error) throw error;
  return data as string;
}

/** Boîte de réception : conversations (1-1 + groupes) + membres + dernier message + non-lus. */
export async function fetchConversations(meId: string): Promise<ConversationPreview[]> {
  const supabase = getSupabase();
  const { data: convs, error } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  const conversations = (convs ?? []) as Conversation[];
  if (conversations.length === 0) return [];
  const convIds = conversations.map((c) => c.id);

  const [{ data: memberRows }, { data: msgs }] = await Promise.all([
    supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id", convIds),
    supabase.from("messages").select("*").in("conversation_id", convIds).order("created_at", { ascending: false }),
  ]);

  const otherIdsByConv = new Map<string, string[]>();
  const allOtherIds = new Set<string>();
  for (const r of (memberRows ?? []) as { conversation_id: string; user_id: string }[]) {
    if (r.user_id === meId) continue;
    const arr = otherIdsByConv.get(r.conversation_id) ?? [];
    arr.push(r.user_id);
    otherIdsByConv.set(r.conversation_id, arr);
    allOtherIds.add(r.user_id);
  }

  const { data: profiles } = await supabase.from("profiles").select(PROFILE_COLS).in("id", [...allOtherIds]);
  const pById = new Map((profiles ?? []).map((p) => [(p as Profile).id, p as Profile]));

  const allMsgs = (msgs ?? []) as Message[];
  const lastByConv = new Map<string, Message>();
  const unreadByConv = new Map<string, number>();
  for (const m of allMsgs) {
    if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    if (m.sender_id !== meId && m.read_at === null)
      unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
  }

  return conversations.map((c) => {
    const others = (otherIdsByConv.get(c.id) ?? []).map((id) => pById.get(id)).filter(Boolean) as Profile[];
    return {
      id: c.id,
      other: c.is_group ? null : others[0] ?? null,
      members: others,
      isGroup: c.is_group,
      title: c.title,
      last_message_at: c.last_message_at,
      lastMessage: lastByConv.get(c.id) ?? null,
      unread: unreadByConv.get(c.id) ?? 0,
      status: c.status,
      iRequested: c.requested_by === meId,
    };
  });
}

/** Profils de tous les membres d'une conversation (incl. moi) — pour le fil de groupe. */
export async function fetchConversationMembers(convId: string): Promise<Profile[]> {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", convId);
  const ids = ((rows ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from("profiles").select(PROFILE_COLS).in("id", ids);
  return (profiles ?? []) as Profile[];
}

export async function createGroupConversation(title: string, memberIds: string[]): Promise<string> {
  const { data, error } = await getSupabase().rpc("create_group_conversation", {
    group_title: title,
    members: memberIds,
  });
  if (error) throw error;
  return data as string;
}

export async function acceptConversation(convId: string): Promise<void> {
  await getSupabase().rpc("accept_conversation", { conv: convId });
}

export async function declineConversation(convId: string): Promise<void> {
  await getSupabase().rpc("decline_conversation", { conv: convId });
}

export async function fetchConversation(convId: string): Promise<Conversation | null> {
  const supabase = getSupabase();
  const { data } = await supabase.from("conversations").select("*").eq("id", convId).maybeSingle();
  return (data as Conversation) ?? null;
}

export async function fetchMessages(convId: string): Promise<Message[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Message[]) ?? [];
}

export async function sendMessage(
  convId: string,
  senderId: string,
  body: string,
  imageUrl?: string | null
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("messages").insert({
    conversation_id: convId,
    sender_id: senderId,
    body: body || null,
    image_url: imageUrl ?? null,
  });
  if (error) throw error;
}

/** Upload une image dans le bucket public 'media', renvoie l'URL publique. */
export async function uploadMedia(file: File, userId: string): Promise<string> {
  const supabase = getSupabase();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${Date.now()}-${Math.round(performance.now())}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

export async function markConversationRead(convId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.rpc("mark_conversation_read", { conv: convId });
}

export async function unreadMessagesCount(meId: string): Promise<number> {
  const supabase = getSupabase();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .neq("sender_id", meId)
    .is("read_at", null);
  return count ?? 0;
}
