import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { createSupabaseClient, type SupabaseClient } from "@whosin/shared";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createSupabaseClient({
    url: extra.supabaseUrl ?? "",
    anonKey: extra.supabaseAnonKey ?? "",
    storage: AsyncStorage,
  });
  return client;
}
