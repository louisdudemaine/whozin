import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { timeAgo, type ConversationPreview } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import {
  acceptConversation,
  avatarUri,
  declineConversation,
  fetchConversations,
} from "@/lib/data";
import { DOCK_SPACE, useC } from "@/lib/theme";

export default function Inbox() {
  const C = useC();
  const { profile } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setList(await fetchConversations(profile.id));
    setLoading(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />;

  const requests = list.filter((c) => c.status === "pending" && !c.iRequested);
  const main = list.filter((c) => c.status === "accepted" || c.iRequested);

  async function accept(id: string) {
    await acceptConversation(id);
    router.push(`/messages/${id}`);
  }
  async function decline(id: string) {
    await declineConversation(id);
    load();
  }

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: DOCK_SPACE }}
      data={main}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        requests.length > 0 ? (
          <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, padding: 12 }}>
            <Text style={{ color: C.brand, fontWeight: "800", marginBottom: 8 }}>
              Demandes de message ({requests.length})
            </Text>
            {requests.map((c) => (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Image source={{ uri: avatarUri(c.other) }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: "700" }}>{c.other?.display_name || c.other?.username}</Text>
                  <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 13 }}>{c.lastMessage?.body ?? "📷"}</Text>
                </View>
                <Pressable onPress={() => accept(c.id)} style={{ backgroundColor: C.brand, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Accepter</Text>
                </Pressable>
                <Pressable onPress={() => decline(c.id)} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: C.textDim, fontWeight: "700", fontSize: 12 }}>Refuser</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <Text style={{ color: C.textDim, textAlign: "center", marginTop: 40 }}>
          Aucune conversation. Va voir qui est sorti et écris-leur !
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/messages/${item.id}`)}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: C.border }}
        >
          <Image source={{ uri: avatarUri(item.other) }} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.surface2 }} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: C.text, fontWeight: "700" }}>{item.title || item.other?.display_name || item.other?.username}</Text>
              <Text style={{ color: C.textDim, fontSize: 12 }}>{timeAgo(item.last_message_at)}</Text>
            </View>
            <Text
              numberOfLines={1}
              style={{ color: item.unread > 0 ? C.text : C.textDim, fontWeight: item.unread > 0 ? "700" : "400", fontSize: 14 }}
            >
              {item.status === "pending" && item.iRequested
                ? "Demande envoyée"
                : (item.lastMessage?.sender_id === profile?.id ? "Toi : " : "") +
                  (item.lastMessage?.body || (item.lastMessage?.view_once ? "📸 Snap" : item.lastMessage?.image_url ? "📷 Photo" : "…"))}
            </Text>
          </View>
          {item.unread > 0 && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.brand }} />}
        </Pressable>
      )}
    />
  );
}
