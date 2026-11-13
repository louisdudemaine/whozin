import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import {
  formatDistance,
  getCategory,
  MONTREAL,
  timeAgo,
  type CheckIn,
  type NearbyPlace,
} from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { checkIn, fetchCheckIns, fetchNearby, getOrCreateConversation } from "@/lib/data";
import { DOCK_SPACE, useC } from "@/lib/theme";
import { openSafetyMenu } from "@/components/SafetyMenu";

export default function MapTab() {
  const C = useC();
  const { profile } = useAuth();
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [center, setCenter] = useState(MONTREAL);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NearbyPlace | null>(null);

  const load = useCallback(async (lat: number, lng: number) => {
    try {
      setPlaces(await fetchNearby(lat, lng));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      let c = MONTREAL;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch {
        /* ignore */
      }
      setCenter(c);
      load(c.lat, c.lng);
    })();
  }, [load]);

  const totalActive = places.reduce((s, p) => s + p.active_checkins, 0);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color: C.textDim }}>
          <Text style={{ color: C.accent, fontWeight: "800" }}>{totalActive}</Text> actif·ve maintenant
          {"  ·  "}
          <Text style={{ color: C.text, fontWeight: "800" }}>{places.length}</Text> lieux
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: DOCK_SPACE }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => load(center.lat, center.lng)}
              tintColor={C.brand}
            />
          }
          renderItem={({ item }) => {
            const cat = getCategory(item.category);
            return (
              <Pressable
                onPress={() => setSelected(item)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: C.border,
                }}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: cat.color,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{cat.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: "700", fontSize: 16 }}>{item.name}</Text>
                  <Text style={{ color: C.textDim, fontSize: 13 }}>
                    <Text style={{ color: cat.color }}>{cat.label.fr}</Text>
                    {"  ·  " + formatDistance(item.distance_m)}
                  </Text>
                </View>
                {item.active_checkins > 0 && (
                  <View
                    style={{
                      backgroundColor: C.surface2,
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: C.accent, fontWeight: "800" }}>{item.active_checkins}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <PlaceModal
        place={selected}
        userId={profile?.id ?? null}
        onClose={() => setSelected(null)}
        onChanged={() => load(center.lat, center.lng)}
      />
    </View>
  );
}

function PlaceModal({
  place,
  userId,
  onClose,
  onChanged,
}: {
  place: NearbyPlace | null;
  userId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const C = useC();
  const [list, setList] = useState<CheckIn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const mine = userId ? list.find((c) => c.user_id === userId) : undefined;
  const router = useRouter();

  async function openDm(otherId: string) {
    try {
      const cid = await getOrCreateConversation(otherId);
      onClose();
      // withAnchor : la liste des conversations est posée SOUS le fil. Sans elle, si
      // l'onglet Messages n'a jamais été ouvert, le fil est seul dans sa pile : pas de
      // bouton retour, et le dock est masqué dans un fil → aucune sortie.
      router.push(`/messages/${cid}`, { withAnchor: true });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (place) fetchCheckIns(place.id).then(setList).catch(() => {});
    else {
      setList([]);
      setMessage("");
    }
  }, [place]);

  async function doCheckIn() {
    if (!place || !userId) return;
    setBusy(true);
    try {
      await checkIn(userId, place.id, message.trim() || null, place.lat, place.lng);
      setMessage("");
      setList(await fetchCheckIns(place.id));
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!place) return null;
  const cat = getCategory(place.category);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      {/* Le clavier pousse la feuille : sinon il recouvre le champ « Quoi de neuf ? ». */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose} />
      <View
        style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 20,
          paddingBottom: 36,
          maxHeight: "75%",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 28 }}>{cat.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: "800" }}>{place.name}</Text>
            <Text style={{ color: C.textDim }}>{place.address ?? cat.label.fr}</Text>
          </View>
          <Text style={{ color: C.accent, fontWeight: "800" }}>{place.active_checkins} ici</Text>
        </View>

        <Text style={{ color: C.textDim, fontSize: 12, fontWeight: "700", marginBottom: 8 }}>
          QUI EST ICI
        </Text>
        <FlatList
          style={{ maxHeight: 220 }}
          data={list}
          keyExtractor={(c) => c.id}
          ListEmptyComponent={
            <Text style={{ color: C.textDim, paddingVertical: 16 }}>
              Personne pour l&apos;instant — sois le premier !
            </Text>
          }
          renderItem={({ item }) => (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "700" }}>
                  {item.author?.display_name || item.author?.username}{" "}
                  <Text style={{ color: C.textDim, fontWeight: "400", fontSize: 12 }}>
                    {timeAgo(item.created_at)}
                  </Text>
                </Text>
                {item.message && <Text style={{ color: C.textDim }}>{item.message}</Text>}
              </View>
              {item.user_id !== userId && (
                <Pressable
                  onPress={() => openDm(item.user_id)}
                  style={{
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 16,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: C.text, fontSize: 12, fontWeight: "700" }}>✉️ Écrire</Text>
                </Pressable>
              )}
              {userId && item.user_id !== userId && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Signaler ou bloquer"
                  hitSlop={10}
                  onPress={() =>
                    openSafetyMenu({
                      meId: userId,
                      targetType: "profile",
                      targetId: item.user_id,
                      targetUserId: item.user_id,
                      name: item.author?.username,
                      onBlocked: () => {
                        setList((l) => l.filter((c) => c.user_id !== item.user_id));
                        onChanged();
                      },
                    })
                  }
                >
                  <Text style={{ color: C.textDim, fontSize: 18, paddingHorizontal: 2 }}>⋯</Text>
                </Pressable>
              )}
            </View>
          )}
        />

        {mine ? (
          <Text style={{ color: C.accent, textAlign: "center", paddingVertical: 12 }}>
            Tu es ici ✓
          </Text>
        ) : (
          <View style={{ marginTop: 8 }}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Quoi de neuf ? (optionnel)"
              placeholderTextColor={C.textDim}
              style={{
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: C.surface2,
                color: C.text,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 10,
              }}
            />
            <Pressable
              onPress={doCheckIn}
              disabled={busy}
              style={{ backgroundColor: C.brand, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {busy ? "..." : "📍 Je suis ici"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
