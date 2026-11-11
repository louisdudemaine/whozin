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
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Sa propre fiche passe par my_profile() : les colonnes privées (date de naissance, mode de
  // position…) ne sont plus lisibles dans la table, même pour soi.
  async function loadProfile() {
    const { data } = await supabase.rpc("my_profile").maybeSingle();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile();
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // Aucun appel Supabase attendu ICI : le client attend ce rappel pendant son
      // initialisation, et tout appel Supabase attend l'initialisation → interblocage
      // (app figée sur le spinner à chaque relance avec une session). On diffère.
      const id = s?.user?.id;
      if (id) setTimeout(() => loadProfile(), 0);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        profile,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
          setProfile(null);
        },
        refreshProfile: async () => {
          if (session?.user) await loadProfile();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
