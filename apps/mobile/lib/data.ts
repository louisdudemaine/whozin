import type {
  CheckIn,
  Conversation,
  ConversationPreview,
  Message,
  NearbyPlace,
  Post,
  Profile,
} from "@whosin/shared";
import { getSupabase } from "./supabase";

/** Pages publiques du web (sans compte) : conditions, confidentialité. */
export const SITE = "https://whos-in-ivory.vercel.app";

/** Colonnes de profiles lisibles pour un AUTRE compte (liste blanche de la base). */
export const PROFILE_COLS = "id,username,display_name,avatar_url,bio,created_at";

/** <Image> de React Native ne rend pas le SVG : on demande à DiceBear sa variante PNG. */
export function avatarUri(p?: { avatar_url?: string | null; username?: string } | null) {
  const uri =
    p?.avatar_url ||
    `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(p?.username || "anon")}`;
  return uri.replace(/(api\.dicebear\.com\/[^/]+\/[^/]+)\/svg/, "$1/png");
}

export async function fetchNearby(lat: number, lng: number, radiusM = 8000): Promise<NearbyPlace[]> {
  const { data, error } = await getSupabase().rpc("places_nearby", {
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

export async function fetchActiveCheckIns(limit = 30): Promise<CheckIn[]> {
  const { data, error } = await getSupabase()
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

export async function fetchCheckIns(placeId: string): Promise<CheckIn[]> {
  const { data, error } = await getSupabase()
    .from("check_ins")
    .select(`*, author:profiles!check_ins_user_id_fkey(${PROFILE_COLS})`)
    .eq("place_id", placeId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as CheckIn[]) ?? [];
}

export async function checkIn(userId: string, placeId: string, message: string | null, lat?: number, lng?: number) {
  const { error } = await getSupabase().from("check_ins").insert({
    user_id: userId,
    place_id: placeId,
    message: message || null,
    lat: lat ?? null,
    lng: lng ?? null,
  });
  if (error) throw error;
}

export async function fetchFeed(limit = 50): Promise<Post[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("post_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Post[];
  if (rows.length === 0) return [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const placeIds = [...new Set(rows.map((r) => r.place_id).filter(Boolean))] as string[];
  const [{ data: profiles }, places] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLS).in("id", userIds),
    placeIds.length
      ? supabase.from("places").select("*").in("id", placeIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const pById = new Map((profiles ?? []).map((p) => [(p as Profile).id, p as Profile]));
  const plById = new Map(((places.data ?? []) as { id: string }[]).map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    like_count: Number(r.like_count ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    author: pById.get(r.user_id),
    place: r.place_id ? (plById.get(r.place_id) as Post["place"]) ?? null : null,
  }));
}

export async function toggleLike(postId: string, userId: string, liked: boolean) {
  const supabase = getSupabase();
  if (liked) {
    await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
  } else {
    await supabase.from("likes").insert({ post_id: postId, user_id: userId });
  }
}

export async function createPost(
  userId: string,
  body: string,
  placeId: string | null,
  lat: number | null,
  lng: number | null
) {
  const { error } = await getSupabase().from("posts").insert({
    user_id: userId,
    body: body || null,
    place_id: placeId,
    visibility: "public",
    lat,
    lng,
  });
  if (error) throw error;
}

// ----- Messagerie -----

export async function getOrCreateConversation(otherId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("get_or_create_conversation", { other: otherId });
  if (error) throw error;
  return data as string;
}

export async function fetchConversations(meId: string): Promise<ConversationPreview[]> {
  const supabase = getSupabase();
  const { data: convs, error } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  const conversations = (convs ?? []) as Conversation[];
  if (conversations.length === 0) return [];
  // Un groupe n'a ni user_a ni user_b : un seul null dans .in() fait échouer TOUTE la requête.
  const otherIds = [
    ...new Set(conversations.map((c) => (c.user_a === meId ? c.user_b : c.user_a)).filter(Boolean)),
  ];
  const convIds = conversations.map((c) => c.id);
  const [{ data: profiles }, { data: msgs }] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLS).in("id", otherIds),
    supabase.from("messages").select("*").in("conversation_id", convIds).order("created_at", { ascending: false }),
  ]);
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
    const otherId = c.user_a === meId ? c.user_b : c.user_a;
    return {
      id: c.id,
      other: (otherId ? pById.get(otherId) : null) ?? null,
      last_message_at: c.last_message_at,
      lastMessage: lastByConv.get(c.id) ?? null,
      unread: unreadByConv.get(c.id) ?? 0,
      status: c.status,
      iRequested: c.requested_by === meId,
      isGroup: c.is_group ?? false,
      title: c.title ?? null,
      members: [],
    };
  });
}

export async function fetchConversation(convId: string): Promise<Conversation | null> {
  const { data } = await getSupabase().from("conversations").select("*").eq("id", convId).maybeSingle();
  return (data as Conversation) ?? null;
}

export async function fetchMessages(convId: string): Promise<Message[]> {
  // RPC : masque les snaps non ouverts + filtre les expirés (parité web)
  const { data, error } = await getSupabase().rpc("fetch_messages", { conv: convId });
  if (error) throw error;
  return (data as Message[]) ?? [];
}

/** 🔥 mode éphémère de la conversation (off | read | 24h). */
export async function setEphemeralMode(convId: string, mode: "off" | "read" | "24h") {
  const { error } = await getSupabase().rpc("set_ephemeral_mode", { conv: convId, mode });
  if (error) throw error;
}

export async function sendMessage(convId: string, senderId: string, body: string, imageUrl?: string | null) {
  const { error } = await getSupabase().from("messages").insert({
    conversation_id: convId,
    sender_id: senderId,
    body: body || null,
    image_url: imageUrl ?? null,
  });
  if (error) throw error;
}

/** Adresses signées courtes des photos « chat » (bucket privé) ; une ancienne adresse https passe telle quelle. */
export async function signChatPhotos(paths: string[], seconds = 600): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const todo: string[] = [];
  for (const p of paths) {
    if (p.startsWith("https://")) out[p] = p;
    else todo.push(p);
  }
  if (todo.length) {
    const { data } = await getSupabase().storage.from("chat").createSignedUrls(todo, seconds);
    for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  }
  return out;
}

export async function markConversationRead(convId: string) {
  await getSupabase().rpc("mark_conversation_read", { conv: convId });
}

export async function acceptConversation(convId: string) {
  await getSupabase().rpc("accept_conversation", { conv: convId });
}

export async function declineConversation(convId: string) {
  await getSupabase().rpc("decline_conversation", { conv: convId });
}

/** Quitter un groupe (le dernier parti emporte le groupe). */
export async function leaveGroup(convId: string) {
  const { error } = await getSupabase().rpc("leave_group", { conv: convId });
  if (error) throw error;
}

export async function unreadMessagesCount(meId: string): Promise<number> {
  const { count } = await getSupabase()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .neq("sender_id", meId)
    .is("read_at", null);
  return count ?? 0;
}

export async function notifyScreenshot(convId: string): Promise<void> {
  await getSupabase().rpc("notify_screenshot", { conv: convId });
}

// ----- Sécurité et compte (parité web : SafetyMenu, page Sécurité) -----

export type ReportType = "profile" | "post" | "message";

/** Bloquer : la base masque ensuite publications, présence et messages dans les deux sens (blocked_with). */
export async function blockUser(meId: string, targetId: string): Promise<void> {
  const { error } = await getSupabase().from("blocks").insert({ blocker_id: meId, blocked_id: targetId });
  if (error && !`${error.code}`.startsWith("23")) throw error; // doublon = déjà bloqué
}

export async function reportTarget(meId: string, type: ReportType, targetId: string, reason: string): Promise<void> {
  const { error } = await getSupabase()
    .from("reports")
    .insert({ reporter_id: meId, target_type: type, target_id: targetId, reason });
  if (error) throw error;
}

/** Portabilité (Loi 25) : tout ce que la base garde sur moi, en un objet JSON. */
export async function exportMyData(): Promise<unknown> {
  const { data, error } = await getSupabase().rpc("export_my_data");
  if (error) throw error;
  return data;
}

/**
 * Droit à l'effacement : les fichiers du bucket public « media » partent AVANT la fiche (après, plus
 * personne ne peut les lister). Au moindre échec on s'arrête : le compte reste et on réessaie.
 * Les photos de messages (bucket privé « chat ») partent avec la purge serveur, une fois les messages effacés.
 */
export async function eraseMyAccount(uid: string): Promise<"files" | "account" | null> {
  const supabase = getSupabase();
  const media = supabase.storage.from("media");
  try {
    for (;;) {
      const { data: files, error: listErr } = await media.list(uid, { limit: 1000 });
      if (listErr) throw listErr;
      const paths = (files ?? []).filter((f) => f.id).map((f) => `${uid}/${f.name}`);
      if (!paths.length) break;
      const { data: gone, error: rmErr } = await media.remove(paths);
      if (rmErr) throw rmErr;
      if (!gone?.length) throw new Error("aucun fichier effacé"); // refus muet de la RLS : on ne boucle pas
    }
  } catch {
    return "files";
  }
  const { error } = await supabase.rpc("erase_my_account");
  if (error) return "account";
  await supabase.auth.signOut();
  return null;
}
