import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { useC } from "@/lib/theme";

export default function ProfileTab() {
  const C = useC();
  const { profile, signOut } = useAuth();
  const [stats, setStats] = useState({ followers: 0, following: 0, checkins: 0 });

  useEffect(() => {
    if (!profile) return;
    const s = getSupabase();
    Promise.all([
      s.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile.id),
      s.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile.id),
      s.from("check_ins").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
    ]).then(([fa, fb, ci]) =>
      setStats({ followers: fa.count ?? 0, following: fb.count ?? 0, checkins: ci.count ?? 0 })
    );
  }, [profile]);

  if (!profile) return null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 20 }}>
      <Text style={{ color: C.text, fontSize: 24, fontWeight: "900" }}>
        {profile.display_name || profile.username}
      </Text>
      <Text style={{ color: C.textDim, marginBottom: 4 }}>@{profile.username}</Text>
      {profile.bio && <Text style={{ color: C.textDim, marginBottom: 16 }}>{profile.bio}</Text>}

      <View style={{ flexDirection: "row", gap: 28, marginVertical: 16 }}>
        <Stat n={stats.checkins} label="check-ins" />
        <Stat n={stats.followers} label="abonnés" />
        <Stat n={stats.following} label="abonnements" />
      </View>

      <Pressable
        onPress={signOut}
        style={{
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: "center",
          marginTop: 8,
        }}
      >
        <Text style={{ color: C.textDim, fontWeight: "700" }}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const C = useC();
  return (
    <View>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: "900" }}>{n}</Text>
      <Text style={{ color: C.textDim, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
