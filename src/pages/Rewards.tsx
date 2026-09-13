import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/hooks/useSession";
import { useLang } from "@/i18n/LanguageContext";
import {
  achievementsFor, achMeta, isUnlocked, xpOf, levelOf, duoTable,
  type AchId, type ReqLite,
} from "@/lib/gamify";
import {
  Star, Receipt, Clock, Flame, ShieldCheck, Target, Medal, Trophy, Lock, Crown,
} from "lucide-react";

const ICONS: Record<AchId, typeof Trophy> = {
  "first-steps": Star,
  "receipt-pro": Receipt,
  "early-bird": Clock,
  "on-fire": Flame,
  trusted: ShieldCheck,
  closer: Target,
  regular: Medal,
  champion: Trophy,
};

export function achIcon(id: AchId) {
  return ICONS[id];
}

export default function Rewards() {
  const { profile } = useSession();
  const { t, lang } = useLang();

  const { data: requests } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_requests")
        .select("requester_id,amount,category,status,created_at,merchant,receipt_url,due_date")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ReqLite[];
    },
  });
  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,email,display_name");
      if (error) throw error;
      return (data ?? []) as { id: string; email: string; display_name: string | null }[];
    },
  });

  const myId = profile?.id ?? "";
  const unlocks = React.useMemo(() => achievementsFor(requests ?? [], myId), [requests, myId]);
  const xp = xpOf(requests ?? [], myId);
  const lvl = levelOf(xp);
  const duo = React.useMemo(() => duoTable(requests ?? []), [requests]);
  const nameOf = (id: string) => {
    if (id === myId) return t("reward.you");
    const u = users?.find((x) => x.id === id);
    return u?.display_name || u?.email?.split("@")[0] || id.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white p-6 flex flex-wrap items-center gap-4">
        <span className="rounded-2xl bg-white/15 p-3 backdrop-blur"><Trophy className="h-8 w-8" /></span>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold">{t("reward.title")}</h1>
          <p className="text-sm text-white/85">{t("reward.sub")}</p>
          <div className="mt-3 h-2.5 rounded-full bg-white/25 overflow-hidden">
            <div className="h-2.5 rounded-full bg-white transition-all" style={{ width: `${Math.round((lvl.into / lvl.span) * 100)}%` }} />
          </div>
          <div className="mt-1 text-xs text-white/85 tabular">{t("reward.level", { n: lvl.level })} • {xp} XP</div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-amber-500" />{t("reward.duo")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {duo.length === 0 && <div className="text-sm text-muted-foreground">{t("dash.noActivity")}</div>}
          {duo.map((d, i) => (
            <div key={d.userId} className="flex items-center gap-3 border-b last:border-0 py-2 text-sm">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
              <span className="flex-1 font-medium">{nameOf(d.userId)}</span>
              {d.userId === myId && <Badge variant="secondary">{t("reward.you")}</Badge>}
              <span className="tabular font-bold">{d.xp} XP</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {unlocks.map((u) => {
          const meta = achMeta(u.id, lang);
          const open = isUnlocked(u);
          const Icon = open ? ICONS[u.id] : Lock;
          return (
            <Card key={u.id} className={open ? "card-lift border-amber-500/40" : "opacity-70"}>
              <CardContent className="pt-6 flex flex-col items-center gap-2 text-center">
                <span className={`rounded-2xl p-3 ${open ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <div className="font-bold">{meta.name}</div>
                <div className="text-xs text-muted-foreground">{meta.desc}</div>
                <div className="w-full h-1.5 rounded bg-muted overflow-hidden">
                  <div className={`h-1.5 rounded ${open ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-muted-foreground/40"}`} style={{ width: `${Math.round((u.progress / u.goal) * 100)}%` }} />
                </div>
                <div className="text-xs tabular text-muted-foreground">{u.progress}/{u.goal}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="text-center">
        <Link to="/"><Button variant="outline">{t("dash.title")}</Button></Link>
      </div>
    </div>
  );
}
