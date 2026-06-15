/**
 * Factory de client Supabase — partagée web + mobile.
 * Web passe le storage par défaut (localStorage) ; mobile passe AsyncStorage.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface CreateClientOptions {
  url: string;
  anonKey: string;
  /** Stockage de session custom (ex. AsyncStorage côté React Native). */
  storage?: {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
  };
  /** false côté serveur Next.js (pas de session persistée). */
  persistSession?: boolean;
}

export function createSupabaseClient(opts: CreateClientOptions): SupabaseClient {
  const { url, anonKey, storage, persistSession = true } = opts;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase non configuré : NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquants."
    );
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession,
      autoRefreshToken: persistSession,
      // detectSessionInUrl exige un navigateur (window.location) : false dès qu'on a
      // un storage custom (React Native = AsyncStorage) ou côté serveur.
      detectSessionInUrl: storage ? false : persistSession,
      ...(storage ? { storage: storage as never } : {}),
    },
  });
}

export type { SupabaseClient };
