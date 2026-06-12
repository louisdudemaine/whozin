import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useC } from "@/lib/theme";

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const C = useC();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTitleStyle: { color: C.text, fontWeight: "900" },
        headerShadowVisible: false,
        tabBarStyle: {
          position: "absolute",
          bottom: 18,
          marginHorizontal: 16,
          height: 64,
          borderRadius: 999,
          backgroundColor: C.surface,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: C.border,
          paddingTop: 8,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        },
        tabBarShowLabel: false,
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
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="carte"
        options={{
          title: "Autour de toi",
          tabBarLabel: "Carte",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          headerShown: false,
          tabBarLabel: "Messages",
          tabBarIcon: ({ focused }) => <TabIcon emoji="✉️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarLabel: "Profil",
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
