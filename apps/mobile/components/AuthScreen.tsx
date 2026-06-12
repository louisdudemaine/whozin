import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { getSupabase } from "@/lib/supabase";
import { useC } from "@/lib/theme";

const DEMO = [
  { email: "aria@whosin.demo", name: "Aria" },
  { email: "max@whosin.demo", name: "Max" },
  { email: "lea@whosin.demo", name: "Léa" },
];

export function AuthScreen() {
  const C = useC();
  const supabase = getSupabase();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) throw error;
        setMsg("Vérifie tes courriels pour confirmer ton compte.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function demo(em: string) {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: em, password: "whosin123" });
    if (error) setMsg(error.message);
    setBusy(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, justifyContent: "center" }}>
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
      <Input placeholder="Courriel" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Input placeholder="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry />

      {msg && <Text style={{ color: C.brand2, marginBottom: 8 }}>{msg}</Text>}

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

      <Text style={{ color: C.textDim, textAlign: "center", marginTop: 40, marginBottom: 10, fontSize: 12 }}>
        ESSAYER AVEC UN COMPTE DÉMO
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {DEMO.map((d) => (
          <Pressable
            key={d.email}
            onPress={() => demo(d.email)}
            disabled={busy}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: C.surface,
              borderRadius: 16,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: C.text, fontWeight: "700" }}>{d.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
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
