import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const FALLBACK_CATEGORIES = ["groceries", "transport", "dining", "utilities", "health", "other"];

/** Owner-managed categories with realtime refresh. Falls back to the legacy set while loading. */
export function useCategories() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("name").order("name");
      if (error) throw error;
      return ((data ?? []) as { name: string }[]).map((c) => c.name);
    },
  });

  const subscribe = (keys: string[][] = [["categories"]]) => {
    const ch = supabase.channel("categories-ch")
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => {
        for (const k of keys) qc.invalidateQueries({ queryKey: k });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  };

  return {
    categories: query.data && query.data.length > 0 ? query.data : FALLBACK_CATEGORIES,
    isLoading: query.isLoading,
    subscribe,
  };
}

/** Normalize a user-typed category into a valid key, or null if invalid. */
export function normalizeCategory(raw: string): string | null {
  const name = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return /^[a-z0-9-]{2,30}$/.test(name) ? name : null;
}
