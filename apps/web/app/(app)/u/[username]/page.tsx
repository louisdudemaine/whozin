"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { Profile } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { fetchProfileByUsername } from "@/lib/data";
import { ProfileView } from "@/components/ProfileView";

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { t } = useT();
  const { profile: me } = useAuth();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    fetchProfileByUsername(username)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [username]);

  // Sa propre fiche : la version complète. Celle d'un autre n'a que les colonnes publiques, et
  // l'enregistrer depuis ici remettait le mode de position et le profil pro à leurs défauts.
  if (me && me.username === username) return <ProfileView profile={me} />;
  if (profile === undefined)
    return <p className="py-16 text-center text-sm text-text-dim">{t.common.loading}</p>;
  if (profile === null)
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-text-dim">@{username} — 404</p>
        <Link href="/feed" className="mt-2 inline-block text-sm text-brand">
          ← {t.feed.title}
        </Link>
      </div>
    );
  return <ProfileView profile={profile} />;
}
