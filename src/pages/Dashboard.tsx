import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { dateLocale } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useRealtime } from "@/hooks/useRealtime";
import { useLang } from "@/i18n/LanguageContext";

export default function Dashboard(){
  useRealtime();
  const { t, lang } = useLang();
  const { data: budgets } = useQuery({ queryKey:["budgets"], queryFn: async()=>{
    const { data, error } = await supabase.from("budgets").select("*").order("created_at",{ascending:false}); if(error) throw error; return data;
  }});
  const { data: requests } = useQuery({ queryKey:["requests"], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("*").order("created_at",{ascending:false}).limit(50); if(error) throw error; return data;
  }});
  const pending = requests?.filter(r=>r.status==="pending").length ?? 0;
  const spendByCurrency = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const b of budgets ?? []) {
      const c = b.currency ?? "IDR";
      map.set(c, (map.get(c) ?? 0) + Number(b.allocated_amount));
    }
    return [...map.entries()];
  }, [budgets]);
  const chartData = budgets?.map(b=> ({ name: b.name.slice(0,12), spend: Number(b.allocated_amount), total: Number(b.total_amount) })) ?? [];
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

  return <div className="space-y-6">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">{t("dash.title")}</h1><Badge variant="pending">{t("dash.pendingBadge", { count: pending })}</Badge></div>
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-sm font-medium">{t("dash.budgets")}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{budgets?.length ?? 0}</div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm font-medium">{t("dash.totalAllocated")}</CardTitle></CardHeader><CardContent><div className="space-y-1">{spendByCurrency.length===0 ? <div className="text-2xl font-bold">{formatMoney(0)}</div> : spendByCurrency.map(([c, v]) => <div key={c} className="text-2xl font-bold">{formatMoney(v, c)}</div>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm font-medium">{t("dash.pendingRequests")}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{pending}</div></CardContent></Card>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>{t("dash.spendByBudget")}</CardTitle></CardHeader><CardContent className="h-[260px]">
        {chartData.length===0 ? <div className="text-sm text-muted-foreground">{t("dash.noBudgets")}</div> :
        <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="spend" fill="#3b82f6" /></BarChart></ResponsiveContainer>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("dash.byStatus")}</CardTitle></CardHeader><CardContent className="h-[260px]">
        {statusData.length===0 ? <div className="text-sm text-muted-foreground">{t("dash.noRequestsYet")}</div> :
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>{statusData.map((d) => <Cell key={d.name} fill={statusColors[d.name]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>{t("dash.trend")}</CardTitle></CardHeader><CardContent className="h-[220px]">
      {trend.every((x) => x.total === 0) ? <div className="text-sm text-muted-foreground">{t("dash.noRequestsYet")}</div> :
      <ResponsiveContainer width="100%" height="100%"><BarChart data={trend}><XAxis dataKey="label" /><YAxis /><Tooltip /><Bar dataKey="total" fill="#10b981" /></BarChart></ResponsiveContainer>}
    </CardContent></Card>
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>{t("dash.budgetsCard")}</CardTitle></CardHeader><CardContent className="space-y-2">        {budgets?.length===0 && <div className="text-sm text-muted-foreground">{t("dash.noBudgetsHint")}</div>}
        {budgets?.map(b=> <div key={b.id} className="flex justify-between border-b py-2 text-sm"><span>{b.name}</span><span>{formatMoney(Number(b.allocated_amount))} / {formatMoney(Number(b.total_amount))}</span></div>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("dash.recentRequests")}</CardTitle></CardHeader><CardContent className="space-y-2">
        {requests?.length===0 && <div className="text-sm text-muted-foreground">{t("dash.noRequests")}</div>}
        {requests?.slice(0,6).map(r=> <div key={r.id} className="flex justify-between border-b py-2 text-sm"><span>{r.merchant ?? r.category} — {formatMoney(Number(r.amount))}</span><Badge variant={r.status as never}>{r.status}</Badge></div>)}
      </CardContent></Card>
    </div>
  </div>;
}
