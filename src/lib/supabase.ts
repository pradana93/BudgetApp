import { createClient } from "@supabase/supabase-js";

// NOTE: use `||` (not `??`) — an empty-string env var must also fall back,
// otherwise createClient throws at import time and the app mounts a blank page.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "";

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
    "Set them in .env.local for local dev and in the Vercel dashboard (Settings → Environment Variables) for deploys, then redeploy."
  );
}

export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});
