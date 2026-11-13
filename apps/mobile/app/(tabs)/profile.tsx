import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { eraseMyAccount, exportMyData, SITE } from "@/lib/data";
import { getSupabase } from "@/lib/supabase";
import { DOCK_SPACE, useC } from "@/lib/theme";

const CONTACT = "privacy@whozin.app";

export default function ProfileTab() {
  const C = useC();
  const { profile, signOut } = useAuth();
  const [stats, setStats] = useState({ followers: 0, following: 0, checkins: 0 });
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);

  useEffect(() => {
    if (!profile) return;
    const s = getSupabase();
    Promise.all([
      s.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile.id),
      s.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile.id),
      s.from("check_ins").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
    ]).then(([fa, fb, ci]) =>
      setStats({ followers: fa.count ?? 0, following: fb.count ?? 0, checkins: ci.count ?? 0 })
    );
  }, [profile]);

  if (!profile) return null;

  async function exportData() {
    setBusy("export");
    try {
      const data = await exportMyData();
      await Share.share({ title: "mes-donnees-whozin.json", message: JSON.stringify(data, null, 2) });
    } catch {
      Alert.alert("Export impossible pour le moment", "Réessaie dans un instant.");
    } finally {
      setBusy(null);
    }
  }

  function confirmErase() {
    Alert.alert(
      "Supprimer ton compte ?",
      "Ta fiche, tes publications, tes check-ins, tes messages et tes photos sont effacés pour de bon. C'est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            if (!profile) return;
            setBusy("erase");
            const echec = await eraseMyAccount(profile.id);
            if (echec) {
              setBusy(null);
              Alert.alert(
                "Suppression non terminée",
                echec === "files"
                  ? "Tes fichiers n'ont pas pu être effacés : ton compte est conservé, réessaie."
                  : "Suppression du compte impossible pour le moment, réessaie."
              );
            } else {
              await signOut(); // la session est déjà fermée ; remet l'écran d'accueil
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: DOCK_SPACE + 20 }}
    >
      <Text style={{ color: C.text, fontSize: 24, fontWeight: "900" }}>
        {profile.display_name || profile.username}
      </Text>
      <Text style={{ color: C.textDim, marginBottom: 4 }}>@{profile.username}</Text>
      {profile.bio && <Text style={{ color: C.textDim, marginBottom: 16 }}>{profile.bio}</Text>}

      <View style={{ flexDirection: "row", gap: 28, marginVertical: 16 }}>
        <Stat n={stats.checkins} label="check-ins" />
        <Stat n={stats.followers} label="abonnés" />
        <Stat n={stats.following} label="abonnements" />
      </View>

      <Button label="Se déconnecter" onPress={signOut} />

      <Section title="MES DONNÉES">
        <Text style={{ color: C.textDim, fontSize: 13, marginBottom: 10 }}>
          Tes droits (Loi 25), sans formulaire ni attente.
        </Text>
        <Button label={busy === "export" ? "Export…" : "⬇️ Exporter mes données"} onPress={exportData} disabled={!!busy} />
        <Button
          label={busy === "erase" ? "Suppression…" : "Supprimer mon compte"}
          onPress={confirmErase}
          disabled={!!busy}
          danger
        />
        {busy === "erase" && <ActivityIndicator color={C.brand} style={{ marginTop: 8 }} />}
      </Section>

      <Section title="RÈGLES ET CONTACT">
        <Link label="Conditions d'utilisation" onPress={() => Linking.openURL(`${SITE}/conditions`)} />
        <Link label="Politique de confidentialité" onPress={() => Linking.openURL(`${SITE}/confidentialite`)} />
        <Text style={{ color: C.textDim, fontSize: 13, marginTop: 8 }}>
          Une question, un problème ? Écris-nous :{" "}
          <Text selectable style={{ color: C.text, fontWeight: "700" }}>
            {CONTACT}
          </Text>
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const C = useC();
  return (
    <View style={{ marginTop: 28 }}>
      <Text style={{ color: C.textDim, fontSize: 12, fontWeight: "800", marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const C = useC();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={{
        borderWidth: 1,
        borderColor: danger ? C.brand : C.border,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
        marginTop: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: danger ? C.brand : C.textDim, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  const C = useC();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={6} style={{ paddingVertical: 8 }}>
      <Text style={{ color: C.text, fontWeight: "600" }}>{label} ↗</Text>
    </Pressable>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const C = useC();
  return (
    <View>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: "900" }}>{n}</Text>
      <Text style={{ color: C.textDim, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
