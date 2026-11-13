import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { SITE } from "@/lib/data";
import { getSupabase } from "@/lib/supabase";
import { useC } from "@/lib/theme";

/**
 * Comptes sans acceptation enregistrée (créés avant les conditions, sur le web, ou compte d'essai
 * d'Apple) : un seul écran, une seule fois. La date part dans user_metadata.terms_accepted_at ;
 * la session mise à jour (USER_UPDATED) fait tomber la barrière.
 */
export function TermsGate() {
  const C = useC();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setErr(null);
    const { error } = await getSupabase().auth.updateUser({ data: { terms_accepted_at: new Date().toISOString() } });
    if (error) {
      setErr("Enregistrement impossible pour le moment, réessaie.");
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", padding: 28 }}>
      <Text style={{ fontSize: 40 }}>📋</Text>
      <Text style={{ color: C.text, fontSize: 24, fontWeight: "900", marginTop: 12 }}>Nos règles</Text>
      <Text style={{ color: C.textDim, marginTop: 10, lineHeight: 21 }}>
        Whozin, c&apos;est 16 ans et plus, et aucune tolérance pour le harcèlement, les menaces, la haine, le
        contenu sexuel ou le partage de la position d&apos;autrui sans son accord. Tu peux signaler ou bloquer
        avec le menu ⋯.
      </Text>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${SITE}/conditions`)} style={{ marginTop: 14 }}>
        <Text style={{ color: C.text, fontWeight: "700" }}>Lire les conditions d&apos;utilisation ↗</Text>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${SITE}/confidentialite`)} style={{ marginTop: 10 }}>
        <Text style={{ color: C.text, fontWeight: "700" }}>Lire la politique de confidentialité ↗</Text>
      </Pressable>
      {err && (
        <Text accessibilityRole="alert" style={{ color: C.brand2, marginTop: 14 }}>
          {err}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={accept}
        disabled={busy}
        style={{ marginTop: 24, backgroundColor: C.brand, borderRadius: 999, paddingVertical: 15, alignItems: "center", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>J&apos;accepte</Text>}
      </Pressable>
      <Pressable onPress={() => getSupabase().auth.signOut()} style={{ marginTop: 16, alignItems: "center" }} hitSlop={8}>
        <Text style={{ color: C.textDim }}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
}
