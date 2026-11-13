import { useEffect, useState } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MfaChallenge } from "@/components/MfaChallenge";
import { getSupabase } from "@/lib/supabase";
import { useC } from "@/lib/theme";

function Gate() {
  const C = useC();
  const { session, loading } = useAuth();
  // barrière 2FA (comme le web) : un facteur vérifié + session aal1 -> code exigé avant l'app
  const [mfa, setMfa] = useState<"checking" | "ok" | "required">("checking");
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return setMfa("checking");
    getSupabase()
      .auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data }) => setMfa(data && data.nextLevel === "aal2" && data.currentLevel !== "aal2" ? "required" : "ok"))
      .catch(() => setMfa("ok"));
  }, [userId]);

  if (loading || (session && mfa === "checking")) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }
  if (!session) return <AuthScreen />;
  if (mfa === "required") return <MfaChallenge onDone={() => setMfa("ok")} />;
  return <Slot />;
}

export default function RootLayout() {
  const C = useC();
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
