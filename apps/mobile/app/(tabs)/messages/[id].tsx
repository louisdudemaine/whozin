import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
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
import * as ScreenCapture from "expo-screen-capture";
import type { Message, Profile } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import {
  acceptConversation,
  declineConversation,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  notifyScreenshot,
  sendMessage,
  setEphemeralMode,
} from "@/lib/data";
import { useC } from "@/lib/theme";

export default function Thread() {
  const C = useC();
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
  const [ephemeral, setEphemeral] = useState<"off" | "read" | "24h">("off");
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<FlatList<Message>>(null);
  const meId = profile?.id;

  const chooseEphemeral = useCallback(() => {
    const apply = async (mode: "off" | "read" | "24h") => {
      setEphemeral(mode);
      try {
        await setEphemeralMode(convId, mode);
      } catch {
        /* ignore */
      }
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "🔥 Messages éphémères",
          options: ["Désactivé", "Après lecture", "Après 24 heures", "Annuler"],
          cancelButtonIndex: 3,
        },
        (i) => {
          if (i === 0) apply("off");
          else if (i === 1) apply("read");
          else if (i === 2) apply("24h");
        }
      );
    } else {
      Alert.alert("🔥 Messages éphémères", "Ce qui se dit la nuit reste à la nuit.", [
        { text: "Désactivé", onPress: () => apply("off") },
        { text: "Après lecture", onPress: () => apply("read") },
        { text: "Après 24 h", onPress: () => apply("24h") },
      ]);
    }
  }, [convId]);

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
      navigation.setOptions({ title: conv.title || (prof as Profile)?.display_name || (prof as Profile)?.username || "" });
      setMessages(msgs);
      setEphemeral((conv.ephemeral_mode as "off" | "read" | "24h") ?? "off");
      setPending(conv.status === "pending");
      setIAmRecipient(conv.requested_by !== meId);
      navigation.setOptions({
        headerRight: () => (
          <Pressable onPress={chooseEphemeral} hitSlop={10} style={{ paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 20, opacity: conv.ephemeral_mode && conv.ephemeral_mode !== "off" ? 1 : 0.4 }}>🔥</Text>
          </Pressable>
        ),
      });
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [convId, meId, navigation, router, chooseEphemeral]);

  // 🔥 horloge : compte à rebours + retrait local des messages expirés
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setMessages((prev) => prev.filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > n));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // 🚨 vraie détection de capture d'écran (natif) -> signale l'autre
  useEffect(() => {
    const sub = ScreenCapture.addScreenshotListener(() => {
      notifyScreenshot(convId).catch(() => {});
    });
    return () => sub.remove();
  }, [convId]);

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
      {ephemeral !== "off" && (
        <View style={{ backgroundColor: "rgba(255,46,99,.1)", paddingVertical: 6, alignItems: "center" }}>
          <Text style={{ color: C.brand, fontSize: 11, fontWeight: "800" }}>
            🔥 {ephemeral === "read" ? "Éphémère · disparaît après lecture" : "Éphémère · disparaît après 24 h"}
          </Text>
        </View>
      )}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.sender_id === meId;
          if (item.kind === "screenshot") {
            return (
              <Text style={{ color: C.textDim, fontSize: 11, fontWeight: "700", textAlign: "center", paddingVertical: 4 }}>
                📸 {mine ? "Tu as" : (other?.display_name || other?.username) + " a"} fait une capture d'écran
              </Text>
            );
          }
          const secsLeft = item.expires_at
            ? Math.max(0, Math.round((new Date(item.expires_at).getTime() - now) / 1000))
            : null;
          const ttl =
            secsLeft === null
              ? null
              : secsLeft >= 3600
                ? `${Math.round(secsLeft / 3600)} h`
                : secsLeft >= 60
                  ? `${Math.round(secsLeft / 60)} min`
                  : `${secsLeft} s`;
          return (
            <View style={{ alignItems: mine ? "flex-end" : "flex-start", opacity: secsLeft !== null && secsLeft <= 10 ? 0.5 : 1 }}>
              {item.view_once ? (
                <View
                  style={{
                    backgroundColor: item.opened_at ? C.surface2 : "rgba(255,46,99,.12)",
                    borderWidth: item.opened_at ? 0 : 1,
                    borderColor: C.brand,
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: item.opened_at ? C.textDim : C.brand, fontWeight: "700", fontSize: 14 }}>
                    📸 {item.opened_at ? "Photo ouverte" : mine ? "Photo vue unique envoyée" : "Photo · ouvre sur le web"}
                  </Text>
                </View>
              ) : item.image_url ? (
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
              {ttl && (
                <Text style={{ color: C.brand, fontSize: 10, fontWeight: "800", marginTop: 2 }}>🔥 {ttl}</Text>
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
