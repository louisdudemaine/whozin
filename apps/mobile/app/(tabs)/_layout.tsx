import { Tabs } from "expo-router";
import { Text } from "react-native";
import { C } from "@/lib/theme";

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, opacity: color === C.brand ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTitleStyle: { color: C.text, fontWeight: "900" },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border },
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.textDim,
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerTitle: "Whozin",
          tabBarLabel: "Fil",
          tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} />,
        }}
      />
      <Tabs.Screen
        name="carte"
        options={{
          title: "Autour de toi",
          tabBarLabel: "Carte",
          tabBarIcon: ({ color }) => <TabIcon emoji="🗺️" color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          headerShown: false,
          tabBarLabel: "Messages",
          tabBarIcon: ({ color }) => <TabIcon emoji="✉️" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarLabel: "Profil",
          tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}
