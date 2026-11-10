import { Stack } from "expo-router";
import { useC } from "@/lib/theme";

export default function MessagesLayout() {
  const C = useC();
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
