"use client";

import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { ProfileView } from "@/components/ProfileView";

export default function MyProfilePage() {
  const { profile } = useAuth();
  const { t } = useT();
  if (!profile)
    return <p className="py-16 text-center text-sm text-text-dim">{t.common.loading}</p>;
  return <ProfileView profile={profile} />;
}
