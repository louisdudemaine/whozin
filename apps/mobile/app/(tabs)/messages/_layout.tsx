import { Stack } from "expo-router";
import { C } from "@/lib/theme";

export default function MessagesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTitleStyle: { color: C.text, fontWeight: "800" },
        headerTintColor: C.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: C.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Messages" }} />
      <Stack.Screen name="[id]" options={{ title: "" }} />
    </Stack>
  );
}
