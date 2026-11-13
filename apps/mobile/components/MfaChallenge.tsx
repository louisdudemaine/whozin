import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput } from "react-native";
import { getSupabase } from "@/lib/supabase";
import { useC } from "@/lib/theme";

/**
 * Barrière 2FA (parité web : components/MfaChallenge.tsx) : un compte qui a activé un code TOTP
 * reste en aal1 après le mot de passe ; rien de l'app ne s'affiche tant que le code n'est pas donné.
 */
export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const C = useC();
  const supabase = getSupabase();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Le facteur se lit d'abord dans la session (sans réseau) ; listFactors seulement en repli.
  async function findFactor(): Promise<string | null> {
    const local = (await supabase.auth.getSession()).data.session?.user.factors?.find(
      (f) => f.factor_type === "totp" && f.status === "verified"
    );
    if (local) return local.id;
    const { data } = await supabase.auth.mfa.listFactors();
    return (data?.totp ?? []).find((f) => f.status === "verified")?.id ?? null;
  }

  useEffect(() => {
    findFactor().then(setFactorId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify() {
    if (code.length < 6) return;
    setBusy(true);
    setErr(null);
    try {
      const fid = factorId ?? (await findFactor());
      if (!fid) throw new Error("facteur introuvable");
      setFactorId(fid);
      const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: fid });
      if (e1) throw e1;
      const { error: e2 } = await supabase.auth.mfa.verify({ factorId: fid, challengeId: ch.id, code });
      if (e2) throw e2;
      onDone();
    } catch {
      setErr("Code refusé ou connexion impossible, réessaie.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", padding: 32 }}
    >
      <Text style={{ fontSize: 40 }}>🔐</Text>
      <Text style={{ color: C.text, fontSize: 22, fontWeight: "900", marginTop: 16 }}>Vérification en deux étapes</Text>
      <Text style={{ color: C.textDim, marginTop: 6, textAlign: "center" }}>
        Entre le code de ton app d&apos;authentification.
      </Text>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
        onSubmitEditing={verify}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoFocus
        placeholder="••••••"
        placeholderTextColor={C.textDim}
        accessibilityLabel="Code à 6 chiffres"
        style={{
          marginTop: 24,
          width: 200,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.surface,
          color: C.text,
          borderRadius: 16,
          paddingVertical: 14,
          textAlign: "center",
          fontSize: 26,
          letterSpacing: 8,
        }}
      />
      {err && (
        <Text accessibilityRole="alert" style={{ color: C.brand2, marginTop: 10 }}>
          {err}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={verify}
        disabled={busy || code.length < 6}
        style={{
          marginTop: 20,
          alignSelf: "stretch",
          backgroundColor: C.brand,
          borderRadius: 999,
          paddingVertical: 15,
          alignItems: "center",
          opacity: busy || code.length < 6 ? 0.5 : 1,
        }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Déverrouiller</Text>}
      </Pressable>
      <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 16 }} hitSlop={8}>
        <Text style={{ color: C.textDim }}>Se déconnecter</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
