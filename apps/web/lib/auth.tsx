"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "@whosin/shared";
import { getSupabase } from "./supabase";

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Sa propre fiche passe par my_profile() : les colonnes privées (date de naissance, mode de
  // position, intérêts…) ne sont plus lisibles dans la table, même pour soi.
  async function loadProfile() {
    const { data } = await supabase.rpc("my_profile").maybeSingle();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile();
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // Aucun appel Supabase attendu ICI : le client attend ce rappel pendant son
      // initialisation, et tout appel Supabase attend l'initialisation → interblocage.
      // Sur mobile l'app restait figée à chaque relance ; ici la course tombait du bon
      // côté. On diffère, comme le recommande Supabase.
      const id = s?.user?.id;
      if (id) setTimeout(() => loadProfile(), 0);
      else setProfile(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 💼 le persona Pro change TOUTE l'identité visuelle (tokens [data-mode="pro"])
  useEffect(() => {
    if (profile?.pro_mode) document.documentElement.dataset.mode = "pro";
    else delete document.documentElement.dataset.mode;
  }, [profile?.pro_mode]);

  const value: AuthCtx = {
    session,
    profile,
    loading,
    refreshProfile: async () => {
      if (session?.user) await loadProfile();
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
