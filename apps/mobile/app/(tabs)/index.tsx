import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { getCategory, timeAgo, type CheckIn, type Post } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { avatarUri, fetchActiveCheckIns, fetchFeed, toggleLike } from "@/lib/data";
import { DOCK_SPACE, useC } from "@/lib/theme";
import { openSafetyMenu } from "@/components/SafetyMenu";

export default function FeedTab() {
  const C = useC();
  const { profile } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([fetchFeed(), fetchActiveCheckIns()]);
      setPosts(p);
      setStories(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />;

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: DOCK_SPACE }}
      data={posts}
      keyExtractor={(p) => p.id}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}
      ListHeaderComponent={<Stories stories={stories} />}
      renderItem={({ item }) => (
        <PostCard
          post={item}
          userId={profile?.id ?? null}
          onOpenProfile={(u) => router.push(`/(tabs)/profile`)}
          onBlocked={(uid) => {
            // la base les masque désormais ; on les retire tout de suite de l'écran
            setPosts((ps) => ps.filter((x) => x.user_id !== uid));
            setStories((ss) => ss.filter((x) => x.user_id !== uid));
          }}
        />
      )}
    />
  );
}

function Stories({ stories }: { stories: CheckIn[] }) {
  const C = useC();
  const router = useRouter();
  if (stories.length === 0) return null;
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.border }}>
      <Text style={{ color: C.brand, fontWeight: "800", fontSize: 12, paddingHorizontal: 12, paddingTop: 10 }}>
        ● EN DIRECT
      </Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={stories}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ gap: 14, padding: 12 }}
        renderItem={({ item }) => {
          const cat = item.place ? getCategory(item.place.category) : getCategory("other");
          return (
            <Pressable
              onPress={() => item.place && router.push("/(tabs)/carte")}
              style={{ alignItems: "center", width: 64 }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  borderWidth: 2.5,
                  borderColor: cat.color,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Image
                  source={{ uri: avatarUri(item.author) }}
                  style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.surface2 }}
                />
              </View>
              <Text numberOfLines={1} style={{ color: C.text, fontSize: 11, marginTop: 4, maxWidth: 64 }}>
                {item.author?.display_name || item.author?.username}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function PostCard({
  post,
  userId,
  onOpenProfile,
  onBlocked,
}: {
  post: Post;
  userId: string | null;
  onOpenProfile: (u: string) => void;
  onBlocked: (userId: string) => void;
}) {
  const C = useC();
  const [liked, setLiked] = useState(!!post.liked_by_me);
  const [count, setCount] = useState(post.like_count);
  const cat = post.place ? getCategory(post.place.category) : null;

  async function onLike() {
    if (!userId) return;
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    try {
      await toggleLike(post.id, userId, liked);
    } catch {
      setLiked(!next);
      setCount((c) => c + (next ? -1 : 1));
    }
  }

  return (
    <View style={{ marginBottom: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10 }}>
        <Image
          source={{ uri: avatarUri(post.author) }}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.surface2 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontWeight: "700", fontSize: 14 }}>
            {post.author?.display_name || post.author?.username}
          </Text>
          {post.place && cat && (
            <Text style={{ color: cat.color, fontSize: 12 }}>
              {cat.emoji} {post.place.name}
            </Text>
          )}
        </View>
        <Text style={{ color: C.textDim, fontSize: 12 }}>{timeAgo(post.created_at)}</Text>
        {userId && post.user_id !== userId && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Signaler ou bloquer"
            hitSlop={10}
            onPress={() =>
              openSafetyMenu({
                meId: userId,
                targetType: "post",
                targetId: post.id,
                targetUserId: post.user_id,
                name: post.author?.username,
                onBlocked: () => onBlocked(post.user_id),
              })
            }
          >
            <Text style={{ color: C.textDim, fontSize: 18, paddingHorizontal: 4 }}>⋯</Text>
          </Pressable>
        )}
      </View>

      {post.photo_url && (
        <Image
          source={{ uri: post.photo_url }}
          style={{ width: "100%", aspectRatio: 1, backgroundColor: C.surface2 }}
        />
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 12, paddingTop: 10 }}>
        <Pressable onPress={onLike} style={{ flexDirection: "row", gap: 6 }}>
          <Text style={{ fontSize: 18 }}>{liked ? "❤️" : "🤍"}</Text>
          <Text style={{ color: liked ? C.brand : C.textDim }}>{count}</Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Text style={{ fontSize: 18 }}>💬</Text>
          <Text style={{ color: C.textDim }}>{post.comment_count}</Text>
        </View>
      </View>

      {post.body && (
        <Text style={{ color: C.text, fontSize: 15, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12 }}>
          <Text style={{ fontWeight: "700" }}>{post.author?.username} </Text>
          {post.body}
        </Text>
      )}
    </View>
  );
}
