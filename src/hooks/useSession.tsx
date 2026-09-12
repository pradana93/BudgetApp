import * as React from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

type Profile = { id: string; email: string; role: "owner" | "member"; display_name: string | null };

const Ctx = React.createContext<{ session: Session | null; profile: Profile | null; loading: boolean; signOut: ()=>Promise<void> } | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!session?.user) { setProfile(null); setLoading(false); return; }
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (data) setProfile(data as Profile);
      // fallback to JWT role if not found
      else setProfile({ id: session.user.id, email: session.user.email ?? "", role: (session.user.user_metadata?.role as "owner"|"member") ?? "member", display_name: null });
      setLoading(false);
    })();
  }, [session]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return <Ctx.Provider value={{ session, profile, loading, signOut }}>{children}</Ctx.Provider>;
}

export function useSession(){
  const ctx = React.useContext(Ctx);
  if(!ctx) throw new Error("useSession must be inside SessionProvider");
  return ctx;
}
