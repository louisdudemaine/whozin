import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SITE } from "@/lib/data";
import { getSupabase } from "@/lib/supabase";
import { useC } from "@/lib/theme";

/** Âge entier d'une date AAAA-MM-JJ saisie à la main (null si ce n'est pas une vraie date). */
function ageFrom(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null; // 2010-02-31
  const now = new Date();
  const beforeBirthday = now.getMonth() < mo || (now.getMonth() === mo && now.getDate() < d);
  return now.getFullYear() - y - (beforeBirthday ? 1 : 0);
}

export function AuthScreen() {
  const C = useC();
  const supabase = getSupabase();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [terms, setTerms] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // mêmes bornes que le serveur (char_length = points de code, d'où [...u]) ; un nom déjà pris reste suffixé
        const u = username.trim();
        const n = [...u].length;
        if (n < 2 || n > 30 || u.toLowerCase().includes("whozin")) {
          setMsg("Nom d'utilisateur : 2 à 30 caractères, « Whozin » est réservé.");
          return;
        }
        // contrôle d'accueil seulement : le serveur reste juge (jour civil de Montréal)
        const age = ageFrom(birthdate.trim());
        if (age === null || age > 110) {
          setMsg("Entre ta vraie date de naissance (AAAA-MM-JJ).");
          return;
        }
        if (age < 16) {
          setMsg("Whozin, c'est 16 ans et plus. Reviens-nous vite! 🌙");
          return;
        }
        if (!terms) {
          setMsg("Coche l'acceptation des conditions d'utilisation pour créer ton compte.");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: u, birthdate: birthdate.trim(), terms_accepted_at: new Date().toISOString() } },
        });
        // seul refus possible du serveur à l'inscription : l'âge (jour civil de Montréal)
        if (error && /database error saving new user/i.test(error.message)) {
          setMsg("Inscription refusée : Whozin, c'est 16 ans et plus.");
          return;
        }
        if (error) throw error;
        setMsg("Vérifie tes courriels pour confirmer ton compte.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: C.text, fontSize: 22, fontWeight: "900", marginBottom: 28 }}>
          Whoz<Text style={{ color: C.brand }}>in</Text>
        </Text>
        <Text style={{ color: C.text, fontSize: 38, fontWeight: "900", lineHeight: 42 }}>
          La ville s'allume.
        </Text>
        <Text style={{ color: C.brand, fontSize: 38, fontWeight: "900", lineHeight: 44, marginBottom: 10 }}>
          T'es où?
        </Text>
        <Text style={{ color: C.textDim, marginBottom: 24, fontSize: 15 }}>
          Vois qui est sorti, en ce moment, autour de toi.
        </Text>

        {mode === "up" && (
          <Input placeholder="Nom d'utilisateur" value={username} onChangeText={setUsername} />
        )}
        {mode === "up" && (
          <Input
            placeholder="Date de naissance (AAAA-MM-JJ)"
            value={birthdate}
            onChangeText={setBirthdate}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            accessibilityLabel="Date de naissance, format AAAA-MM-JJ"
          />
        )}
        <Input placeholder="Courriel" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Input placeholder="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry />

        {msg && (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: C.brand2, marginBottom: 8 }}>
            {msg}
          </Text>
        )}

        {mode === "up" && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: terms }}
            onPress={() => setTerms(!terms)}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 }}
          >
            <Text style={{ fontSize: 18, color: terms ? C.brand : C.textDim }}>{terms ? "☑︎" : "☐"}</Text>
            <Text style={{ flex: 1, color: C.textDim, fontSize: 12, lineHeight: 17 }}>
              J&apos;accepte les{" "}
            <Text accessibilityRole="link" style={{ color: C.text, fontWeight: "700" }} onPress={() => Linking.openURL(`${SITE}/conditions`)}>
              Conditions d&apos;utilisation
            </Text>{" "}
            (aucune tolérance pour les contenus ou comportements abusifs) et la{" "}
            <Text accessibilityRole="link" style={{ color: C.text, fontWeight: "700" }} onPress={() => Linking.openURL(`${SITE}/confidentialite`)}>
              Politique de confidentialité
            </Text>
            .
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={submit}
          disabled={busy}
          style={{ backgroundColor: C.brand, borderRadius: 999, paddingVertical: 15, alignItems: "center", shadowColor: C.brand, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8 }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              {mode === "in" ? "Se connecter" : "Créer un compte"}
            </Text>
          )}
        </Pressable>


        <Pressable onPress={() => setMode(mode === "in" ? "up" : "in")} style={{ marginTop: 16 }}>
          <Text style={{ color: C.textDim, textAlign: "center" }}>
            {mode === "in" ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  const C = useC();
  return (
    <TextInput
      placeholderTextColor={C.textDim}
      autoCapitalize="none"
      {...props}
      style={{
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.surface,
        color: C.text,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 14,
        marginBottom: 10,
        fontSize: 16,
      }}
    />
  );
}
