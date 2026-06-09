import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import type { Message, Profile } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import {
  acceptConversation,
  declineConversation,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  sendMessage,
} from "@/lib/data";
import { C } from "@/lib/theme";

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = String(id);
  const { profile } = useAuth();
  const navigation = useNavigation();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [iAmRecipient, setIAmRecipient] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const meId = profile?.id;

  useEffect(() => {
    if (!meId) return;
    let alive = true;
    const supabase = getSupabase();
    (async () => {
      const conv = await fetchConversation(convId);
      if (!conv) {
        router.replace("/messages");
        return;
      }
      const otherId = conv.user_a === meId ? conv.user_b : conv.user_a;
      const [{ data: prof }, msgs] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", otherId).maybeSingle(),
        fetchMessages(convId),
      ]);
      if (!alive) return;
      setOther((prof as Profile) ?? null);
      navigation.setOptions({ title: (prof as Profile)?.display_name || (prof as Profile)?.username || "" });
      setMessages(msgs);
      setPending(conv.status === "pending");
      setIAmRecipient(conv.requested_by !== meId);
      markConversationRead(convId).catch(() => {});
    })();

    const channel = supabase
      .channel(`thread-${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== meId) markConversationRead(convId).catch(() => {});
        }
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [convId, meId, navigation, router]);

  const send = useCallback(async () => {
    if (!meId || !text.trim()) return;
    const body = text.trim();
    setText("");
    try {
      await sendMessage(convId, meId, body);
    } catch {
      setText(body);
    }
  }, [convId, meId, text]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.sender_id === meId;
          return (
            <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
              {item.image_url ? (
                <Image
                  source={{ uri: item.image_url }}
                  style={{ width: 200, height: 200, borderRadius: 16, backgroundColor: C.surface2 }}
                />
              ) : (
                <View
                  style={{
                    maxWidth: "78%",
                    backgroundColor: mine ? C.brand : C.surface2,
                    borderRadius: 18,
                    borderBottomRightRadius: mine ? 4 : 18,
                    borderBottomLeftRadius: mine ? 18 : 4,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ color: mine ? "#fff" : C.text, fontSize: 15 }}>{item.body}</Text>
                </View>
              )}
            </View>
          );
        }}
      />

      {pending && iAmRecipient ? (
        <View style={{ borderTopWidth: 1, borderTopColor: C.border, padding: 16 }}>
          <Text style={{ color: C.textDim, textAlign: "center", marginBottom: 12 }}>
            <Text style={{ color: C.text, fontWeight: "700" }}>
              {other?.display_name || other?.username}
            </Text>{" "}
            veut discuter avec toi.
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={async () => {
                await acceptConversation(convId);
                setPending(false);
              }}
              style={{ flex: 1, backgroundColor: C.brand, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>Accepter</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await declineConversation(convId);
                router.replace("/messages");
              }}
              style={{ flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
            >
              <Text style={{ color: C.textDim, fontWeight: "700" }}>Refuser</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: C.border,
            padding: 10,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Envoie un message…"
            placeholderTextColor={C.textDim}
            onSubmitEditing={send}
            style={{
              flex: 1,
              backgroundColor: C.surface2,
              color: C.text,
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 10,
              fontSize: 15,
            }}
          />
          <Pressable
            onPress={send}
            disabled={!text.trim()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: C.brand,
              alignItems: "center",
              justifyContent: "center",
              opacity: text.trim() ? 1 : 0.4,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>↑</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
