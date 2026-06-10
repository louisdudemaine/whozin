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
  lng?: number
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("check_ins").insert({
    user_id: userId,
    place_id: placeId,
    message: message || null,
    lat: lat ?? null,
    lng: lng ?? null,
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
