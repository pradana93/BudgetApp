import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — using placeholder. Set .env.local");
}

export const supabase = createClient(url ?? "https://placeholder.supabase.co", anonKey ?? "placeholder-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});
