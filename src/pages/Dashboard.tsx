import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { useRealtime } from "@/hooks/useRealtime";
import { useLang } from "@/i18n/LanguageContext";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/hooks/useCountUp";
import { achievementsFor, achMeta, isUnlocked, levelOf, xpOf } from "@/lib/gamify";
import { dateLocale, timeAgo } from "@/lib/datetime";
import { Wallet, TrendingUp, Clock, ArrowDownLeft, ArrowUpRight, Receipt, Trophy } from "lucide-react";
import AskBudgetApp from "@/components/AskBudgetApp";

export default function Dashboard(){
  useRealtime();
  const { t, lang } = useLang();
  const { profile } = useSession();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = profile?.role === "owner";
  const { data: budgets, isLoading: loadingBudgets } = useQuery({ queryKey:["budgets"], queryFn: async()=>{
    const { data, error } = await supabase.from("budgets").select("*").order("created_at",{ascending:false}); if(error) throw error; return data;
  }});
  const { data: requests, isLoading: loadingRequests } = useQuery({ queryKey:["requests"], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("*").order("created_at",{ascending:false}).limit(50); if(error) throw error; return data;
  }});
  const { data: ledger } = useQuery({ queryKey:["dashboard-ledger"], queryFn: async()=>{
    const { data, error } = await supabase.from("ledger_entries").select("id,budget_id,debit,credit,reference_type,description,created_at").order("created_at",{ascending:false}).limit(20); if(error) throw error; return data;
  }});
  const loading = loadingBudgets || loadingRequests;
  const pending = requests?.filter(r=>r.status==="pending").length ?? 0;
  const budgetsCount = Math.round(useCountUp(budgets?.length ?? 0));
  const pendingCount = Math.round(useCountUp(pending));

  const myUnlocks = React.useMemo(() => (profile ? achievementsFor(requests ?? [], profile.id) : []), [requests, profile]);  const myXp = profile ? xpOf(requests ?? [], profile.id) : 0;
  const myLvl = levelOf(myXp);
  const askCtx = React.useMemo(() => ({
    budgets: (budgets ?? []).map((b) => ({
      name: b.name,
      total_amount: b.total_amount,
      allocated_amount: b.allocated_amount,
      available_amount: b.available_amount,
      currency: b.currency,
      period_end: (b as Record<string, unknown>).period_end as string | null | undefined,
    })),
    requests: (requests ?? []).map((x) => ({
      amount: x.amount,
      category: x.category,
      status: x.status,
      merchant: x.merchant,
      created_at: x.created_at,
    })),
  }), [budgets, requests]);
  React.useEffect(() => {
    if (!profile || !requests || requests.length === 0) return;
    const ids = myUnlocks.filter(isUnlocked).map((u) => u.id);
    let seen: string[] = [];
    try {
      seen = JSON.parse(window.localStorage.getItem("budgetapp-seen-ach") ?? "[]");
    } catch {
      seen = [];
    }
    const fresh = ids.filter((id) => !seen.includes(id));
    if (fresh.length > 0) {
      try {
        window.localStorage.setItem("budgetapp-seen-ach", JSON.stringify([...seen, ...fresh]));
      } catch {
        /* storage unavailable */
      }
      toast({ title: t("reward.unlockedToast"), description: achMeta(fresh[0], lang).name });
    }
  }, [profile, requests, myUnlocks, toast, t, lang]);

  const hour = new Date().getHours();
  const greetKey = hour < 11 ? "dash.greetMorning" : hour < 15 ? "dash.greetMidday" : hour < 19 ? "dash.greetEvening" : "dash.greetNight";
  const who = profile?.display_name || String(profile?.email || "").split("@")[0] || "";
  const today = new Date().toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "long" });

  const spendByCurrency = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const b of budgets ?? []) {
      const c = b.currency ?? "IDR";
      map.set(c, (map.get(c) ?? 0) + Number(b.allocated_amount));
    }
    return [...map.entries()];
  }, [budgets]);
  const chartData = budgets?.map(b=> ({ name: String(b.name ?? "").slice(0,12), spend: Number(b.allocated_amount), total: Number(b.total_amount) })) ?? [];
  const statusColors: Record<string, string> = { pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444", reconciled: "#3b82f6" };
  const statusData = ["pending", "approved", "rejected", "reconciled"]
    .map((s) => ({ name: s, value: requests?.filter((r) => r.status === s).length ?? 0 }))
    .filter((d) => d.value > 0);
  const trend = React.useMemo(() => {
    const buckets = new Map<string, { label: string; total: number }>();
    const nowD = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      buckets.set(key, { label: d.toLocaleDateString(dateLocale(lang), { month: "short" }), total: 0 });
    }
    for (const r of requests ?? []) {
      const d = new Date(r.created_at);
      const b = buckets.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (b) b.total += Number(r.amount);
    }
    return [...buckets.values()];
  }, [requests, lang]);
  const compare = React.useMemo(() => {
    const nowD = new Date();
    const curKey = `${nowD.getFullYear()}-${nowD.getMonth()}`;
    const pv = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
    const prevKey = `${pv.getFullYear()}-${pv.getMonth()}`;
    const map = new Map<string, { name: string; cur: number; prev: number }>();
    for (const r of requests ?? []) {
      if (r.status !== "approved" && r.status !== "reconciled") continue;
      const d = new Date(r.created_at);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (k !== curKey && k !== prevKey) continue;
      const e = map.get(r.category) ?? { name: r.category, cur: 0, prev: 0 };
      if (k === curKey) e.cur += Number(r.amount);
      else e.prev += Number(r.amount);
      map.set(r.category, e);
    }
    return [...map.values()].sort((a, b) => b.cur + b.prev - (a.cur + a.prev)).slice(0, 6);
  }, [requests]);
  const digest = React.useMemo(() => {
    const nowD = new Date();
    const start = new Date(nowD);
    start.setDate(nowD.getDate() - ((nowD.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    let filed = 0, approved = 0, reconciled = 0, sum = 0;
    for (const r of requests ?? []) {
      if (new Date(r.created_at) < start) continue;
      filed++;
      if (r.status === "approved" || r.status === "reconciled") approved++;
      if (r.status === "reconciled") {
        reconciled++;
        sum += Number(r.amount);
      }
    }
    return { filed, approved, reconciled, sum };
  }, [requests]);

  type Goal = { id: string; owner_id: string; name: string; target_amount: number; saved_amount: number; currency: string; status: string };
  const { data: goals } = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_goals").select("*").neq("status", "archived").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });
  const [goalForm, setGoalForm] = React.useState({ name: "", target: "" });
  const [fundAmts, setFundAmts] = React.useState<Record<string, string>>({});
  const createGoal = useMutation({
    mutationFn: async () => {
      if (!profile || !goalForm.name.trim() || !(Number(goalForm.target) > 0)) throw new Error("invalid");
      const { error } = await supabase.from("savings_goals").insert({ name: goalForm.name.trim(), target_amount: Number(goalForm.target), currency: "IDR", owner_id: profile.id, status: "active" });
      if (error) throw error;
    },
    onSuccess: () => { setGoalForm({ name: "", target: "" }); qc.invalidateQueries({ queryKey: ["goals"] }); toast({ title: t("goals.created") }); },
    onError: (e: Error) => { if (e.message !== "invalid") toast({ title: t("goals.failed"), description: e.message, variant: "destructive" }); },
  });
  const addFunds = useMutation({
    mutationFn: async ({ g, amt }: { g: Goal; amt: number }) => {
      const { error } = await supabase.from("savings_goals").update({ saved_amount: Number(g.saved_amount) + amt }).eq("id", g.id);
      if (error) throw error;
    },
    onSuccess: () => { setFundAmts({}); qc.invalidateQueries({ queryKey: ["goals"] }); toast({ title: t("goals.updated") }); },
    onError: (e: Error) => toast({ title: t("goals.failed"), description: e.message, variant: "destructive" }),
  });
  const setGoalStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("savings_goals").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goals"] }); toast({ title: t("goals.updated") }); },
    onError: (e: Error) => toast({ title: t("goals.failed"), description: e.message, variant: "destructive" }),
  });
  const goalPct = (g: Goal) => {
    const target = Number(g.target_amount);
    if (!(target > 0)) return 0;
    return Math.min(100, Math.max(0, (Number(g.saved_amount) / target) * 100));
  };

  type FeedItem = { id: string; ts: string; icon: "out" | "in" | "req"; title: string; sub: string };
  const feed: FeedItem[] = React.useMemo(() => {
    const items: FeedItem[] = [
      ...((ledger ?? []).map((l) => ({
        id: `l-${l.id}`, ts: l.created_at,
        icon: (Number(l.debit) > 0 ? "out" : "in") as "out" | "in",
        title: l.description || l.reference_type,
        sub: `${Number(l.debit) > 0 ? "-" : "+"}${formatMoney(Number(l.debit) > 0 ? l.debit : l.credit)}`,
      }))),
      ...((requests ?? []).slice(0, 10).map((r) => ({
        id: `r-${r.id}`, ts: r.created_at, icon: "req" as const,
        title: r.merchant ?? r.category,
        sub: `${formatMoney(Number(r.amount))} • ${r.status}`,
      }))),
    ];
    return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 8);
  }, [ledger, requests]);

  return <div className="space-y-6">
    <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white p-5 md:p-6 flex flex-wrap items-center justify-between gap-3 shadow-lg overflow-hidden relative">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
      <div className="relative">
        <h1 className="text-2xl font-bold tracking-tight">{t(greetKey)}{who ? `, ${who}` : ""}</h1>
        <p className="text-sm text-white/80 mt-0.5">{today}</p>
      </div>
      <Badge variant="pending" className="relative">{t("dash.pendingBadge", { count: pending })}</Badge>
    </div>
    {!loading && (budgets?.length ?? 0) === 0 && (requests?.length ?? 0) === 0 && (
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white p-6 md:p-8 text-center">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">{t("dash.welcome")}</h2>
          <p className="mt-1 text-sm text-white/85 max-w-md mx-auto">{t("dash.welcomeSub")}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {isOwner && <Link to="/budgets/new"><Button variant="secondary">{t("budgets.new")}</Button></Link>}
            <Link to="/requests/new"><Button variant="secondary">{t("req.new")}</Button></Link>
            <Link to="/rewards"><Button variant="outline" className="bg-white/10 text-white border-white/30 hover:bg-white/20 hover:text-white">{t("nav.rewards")}</Button></Link>
          </div>
        </div>
      </Card>
    )}
    <div className="grid gap-4 md:grid-cols-3">
      {loading ? [0, 1, 2].map((i) => <div key={i} className="skeleton h-[104px]" />) : <>
      <Card className="card-lift"><CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><span className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 p-1.5 text-white"><Wallet className="h-4 w-4" /></span>{t("dash.budgets")}</CardTitle></CardHeader><CardContent><div className="stat-value">{budgetsCount}</div></CardContent></Card>
      <Card className="card-lift"><CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><span className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 p-1.5 text-white"><TrendingUp className="h-4 w-4" /></span>{t("dash.totalAllocated")}</CardTitle></CardHeader><CardContent><div className="space-y-1">{spendByCurrency.length===0 ? <div className="stat-value">{formatMoney(0)}</div> : spendByCurrency.map(([c, v]) => <div key={c} className="stat-value">{formatMoney(v, c)}</div>)}</div></CardContent></Card>
      <Card className="card-lift"><CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><span className="rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 p-1.5 text-white"><Clock className="h-4 w-4" /></span>{t("dash.pendingRequests")}</CardTitle></CardHeader><CardContent><div className="stat-value">{pendingCount}</div></CardContent></Card>
      </>}
    </div>
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 flex flex-wrap items-center gap-3">
        <Trophy className="h-6 w-6 shrink-0" />
        <div className="flex-1 min-w-[160px]">
          <div className="font-bold">{t("reward.level", { n: myLvl.level })} • {myXp} XP</div>
          <div className="mt-1.5 h-2 rounded-full bg-white/25 overflow-hidden"><div className="h-2 rounded-full bg-white transition-all" style={{ width: `${Math.round((myLvl.into / myLvl.span) * 100)}%` }} /></div>
        </div>
        <div className="hidden sm:flex gap-1.5">
          {myUnlocks.filter(isUnlocked).slice(0, 3).map((u) => (
            <span key={u.id} title={achMeta(u.id, lang).name} className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium">{achMeta(u.id, lang).name}</span>
          ))}
        </div>
        <Link to="/rewards"><Button variant="secondary" size="sm">{t("reward.viewAll")}</Button></Link>
      </div>
    </Card>
    <AskBudgetApp ctx={askCtx} />
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>{t("dash.spendByBudget")}</CardTitle></CardHeader><CardContent className="h-[260px]">
        {chartData.length===0 ? <div className="text-sm text-muted-foreground">{t("dash.noBudgets")}</div> :
        <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><defs><linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" /><stop offset="100%" stopColor="#2563eb" /></linearGradient></defs><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="spend" fill="url(#spendGrad)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("dash.byStatus")}</CardTitle></CardHeader><CardContent className="h-[260px]">
        {statusData.length===0 ? <div className="text-sm text-muted-foreground">{t("dash.noRequestsYet")}</div> :
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>{statusData.map((d) => <Cell key={d.name} fill={statusColors[d.name]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>{t("dash.trend")}</CardTitle></CardHeader><CardContent className="h-[220px]">
      {trend.every((x) => x.total === 0) ? <div className="text-sm text-muted-foreground">{t("dash.noRequestsYet")}</div> :
      <ResponsiveContainer width="100%" height="100%"><BarChart data={trend}><defs><linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#059669" /></linearGradient></defs><XAxis dataKey="label" /><YAxis /><Tooltip /><Bar dataKey="total" fill="url(#trendGrad)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("dash.compare")}</CardTitle></CardHeader><CardContent className="h-[240px]">
      {compare.length===0 ? <div className="text-sm text-muted-foreground">{t("dash.noRequestsYet")}</div> :
      <ResponsiveContainer width="100%" height="100%"><BarChart data={compare}><defs><linearGradient id="cmpCur" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" /><stop offset="100%" stopColor="#2563eb" /></linearGradient></defs><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="prev" name={t("dash.lastMonth")} fill="#94a3b8" radius={[4, 4, 0, 0]} /><Bar dataKey="cur" name={t("dash.thisMonth")} fill="url(#cmpCur)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("dash.digest")}</CardTitle></CardHeader><CardContent>
      {digest.filed === 0 ? <div className="text-sm text-muted-foreground">{t("dash.digestEmpty")}</div> :
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div><div className="text-2xl font-bold tabular">{digest.filed}</div><div className="text-xs text-muted-foreground">{t("dash.dFiled")}</div></div>
        <div><div className="text-2xl font-bold tabular">{digest.approved}</div><div className="text-xs text-muted-foreground">{t("dash.dApproved")}</div></div>
        <div><div className="text-2xl font-bold tabular">{digest.reconciled}</div><div className="text-xs text-muted-foreground">{t("dash.dReconciled")}</div></div>
        <div><div className="text-2xl font-bold tabular">{formatMoney(digest.sum)}</div><div className="text-xs text-muted-foreground">{t("dash.dSum")}</div></div>
      </div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("dash.goals")}</CardTitle></CardHeader><CardContent className="space-y-3">
      {isOwner && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input placeholder={t("goals.name")} value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} maxLength={120} />
          <Input placeholder={t("goals.target")} value={goalForm.target} onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })} inputMode="decimal" className="sm:max-w-[160px]" />
          <Button onClick={() => createGoal.mutate()} disabled={createGoal.isPending} className="shrink-0">{t("goals.new")}</Button>
        </div>
      )}
      {(goals?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground">{t("goals.noGoals")}</div>}
      {goals?.map((g) => (
        <div key={g.id} className="rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <svg viewBox="0 0 36 36" className="h-14 w-14 shrink-0">
            <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-muted" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke={`url(#goalGrad-${g.id})`} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${goalPct(g)} 100`} transform="rotate(-90 18 18)" />
            <defs><linearGradient id={`goalGrad-${g.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs>
          </svg>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{g.name} {g.status === "done" && <Badge variant="approved" className="ml-1">{t("goals.complete")}</Badge>}</div>
            <div className="text-sm text-muted-foreground tabular">{t("goals.ofTarget", { saved: formatMoney(Number(g.saved_amount), g.currency), target: formatMoney(Number(g.target_amount), g.currency) })}</div>
            {isOwner && g.status === "active" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Input placeholder={t("goals.amountPh")} value={fundAmts[g.id] ?? ""} onChange={(e) => setFundAmts({ ...fundAmts, [g.id]: e.target.value })} inputMode="decimal" className="max-w-[140px] h-8 text-sm" />
                <Button size="sm" variant="outline" onClick={() => addFunds.mutate({ g, amt: Number(fundAmts[g.id]) })} disabled={addFunds.isPending || !(Number(fundAmts[g.id]) > 0)}>{t("goals.addFunds")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setGoalStatus.mutate({ id: g.id, status: "done" })}>{t("goals.complete")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setGoalStatus.mutate({ id: g.id, status: "archived" })}>{t("goals.archive")}</Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("dash.activity")}</CardTitle></CardHeader><CardContent className="space-y-1">
      {feed.length===0 && <div className="text-sm text-muted-foreground">{t("dash.noActivity")}</div>}
      {feed.map((f) => (
        <div key={f.id} className="flex items-center gap-3 border-b last:border-0 py-2 text-sm">
          <span className={`rounded-full p-1.5 ${f.icon === "out" ? "bg-red-500/10 text-red-500" : f.icon === "in" ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"}`}>
            {f.icon === "out" ? <ArrowDownLeft className="h-4 w-4" /> : f.icon === "in" ? <ArrowUpRight className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
          </span>
          <span className="flex-1 min-w-0 truncate">{f.title}</span>
          <span className="text-muted-foreground tabular whitespace-nowrap">{f.sub}</span>
          <span className="text-xs text-muted-foreground whitespace-nowrap w-20 text-right">{timeAgo(f.ts, lang)}</span>
        </div>
      ))}
    </CardContent></Card>
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>{t("dash.budgetsCard")}</CardTitle></CardHeader><CardContent className="space-y-2">
        {budgets?.length===0 && <div className="text-sm text-muted-foreground">{t("dash.noBudgetsHint")}</div>}
        {budgets?.map(b=> <div key={b.id} className="flex justify-between border-b py-2 text-sm"><span>{b.name}</span><span>{formatMoney(Number(b.allocated_amount))} / {formatMoney(Number(b.total_amount))}</span></div>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("dash.recentRequests")}</CardTitle></CardHeader><CardContent className="space-y-2">
        {requests?.length===0 && <div className="text-sm text-muted-foreground">{t("dash.noRequests")}</div>}
        {requests?.slice(0,6).map(r=> <div key={r.id} className="flex justify-between border-b py-2 text-sm"><span>{r.merchant ?? r.category} — {formatMoney(Number(r.amount))}</span><Badge variant={r.status as never}>{r.status}</Badge></div>)}
      </CardContent></Card>
    </div>
  </div>;
}
