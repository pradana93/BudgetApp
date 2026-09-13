import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { AVATAR_THEMES, initialsOf } from "@/lib/avatar";
import { cn } from "@/lib/utils";

const clsCache = new Map<string, string>();

function hashCls(id: string): string {
  const cached = clsCache.get(id);
  if (cached) return cached;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const cls = AVATAR_THEMES[h % AVATAR_THEMES.length].cls;
  clsCache.set(id, cls);
  return cls;
}

type Props = { userId: string; name: string; className?: string; textClass?: string; avatarUrl?: string | null; version?: string | null };

/**
 * Renders a user's photo (avatar.jpg, cache-busted via version or the profile
 * row's updated_at) falling back to gradient initials.
 */
export function UserAvatar({ userId, name, className, textClass, avatarUrl, version }: Props) {
  const needsQuery = avatarUrl === undefined;
  const { data } = useQuery({
    queryKey: ["profile-avatar", userId],
    queryFn: async () => {
      const { data: p, error } = await supabase.from("profiles").select("updated_at,avatar_url").eq("id", userId).single();
      if (error || !p) return null;
      return p as { updated_at: string; avatar_url: string | null };
    },
    staleTime: 60_000,
    enabled: needsQuery,
  });
  const url = needsQuery ? data?.avatar_url ?? null : avatarUrl;
  const ver = needsQuery ? data?.updated_at ?? "" : version ?? "";
  const src = url ? `${url}?v=${encodeURIComponent(ver)}` : null;
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [src]);

  if (src && !failed) {
    return <img src={src} alt={name} onError={() => setFailed(true)} className={cn("h-9 w-9 rounded-full object-cover shrink-0", className)} />;
  }
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white",
        hashCls(userId),
        className,
        textClass
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
