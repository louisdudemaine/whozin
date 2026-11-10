import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useC } from "@/lib/theme";

function Gate() {
  const C = useC();
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }
  if (!session) return <AuthScreen />;
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
