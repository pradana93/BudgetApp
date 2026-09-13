import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { analyzeBudget, budgetHealth, cumulativeSpendSeries } from "@/lib/insights";
import { dateLocale, formatDate, formatDateTime } from "@/lib/datetime";
import { useLang } from "@/i18n/LanguageContext";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function BudgetDetail(){
  const { id } = useParams();
  const { t, lang } = useLang();
  const { profile } = useSession();
  const { toast } = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const isOwner = profile?.role === "owner";
  const { data: budget } = useQuery({ queryKey:["budgets",id], queryFn: async()=>{
    const { data, error } = await supabase.from("budgets").select("*").eq("id",id!).single(); if(error) throw error; return data;
  }});
  const { data: ledger } = useQuery({ queryKey:["ledger",id], queryFn: async()=>{
    const { data, error } = await supabase.from("ledger_entries").select("*").eq("budget_id",id!).order("created_at",{ascending:true}); if(error) throw error; return data;
  }});
  const { data: requests } = useQuery({ queryKey:["requests",id], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("*").eq("budget_id",id!).order("created_at",{ascending:false}); if(error) throw error; return data;
  }});

  const insights = React.useMemo(
    () => analyzeBudget(ledger ?? [], requests ?? [], budget?.available_amount ?? 0, budget?.currency ?? "IDR", new Date(), lang),
    [ledger, requests, budget, lang]
  );
  const series = React.useMemo(() => cumulativeSpendSeries(ledger ?? [], dateLocale(lang)), [ledger, lang]);  const health = budgetHealth({
    allocated: budget?.allocated_amount ?? 0,
    total: budget?.total_amount ?? 0,
    available: budget?.available_amount ?? 0,
    pendingExposure: insights.pendingExposure,
    runwayDays: insights.runwayDays,
  });
  const healthVariant = health === "over" ? "destructive" : health === "atRisk" ? "pending" : "approved";
  const healthLabel = health === "over" ? t("health.over") : health === "atRisk" ? t("health.atRisk") : t("health.onTrack");

  const clone = useMutation({
    mutationFn: async () => {
      if (!budget || !profile) throw new Error("not ready");
      const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let start: string | null = null;
      let end: string | null = null;
      if (budget.period_start && budget.period_end) {
        const s = new Date(budget.period_start);
        const e = new Date(budget.period_end);
        const span = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
        const ns = new Date(s);
        ns.setMonth(ns.getMonth() + span);
        const ne = new Date(e);
        ne.setMonth(ne.getMonth() + span);
        start = isoLocal(ns);
        end = isoLocal(ne);
      }
      const { data, error } = await supabase.from("budgets").insert({
        name: `${budget.name} +1`,
        total_amount: Number(budget.total_amount),
        currency: budget.currency,
        period_start: start,
        period_end: end,
        status: "active",
        owner_id: profile.id,
      }).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: t("bd.cloned") });
      nav(`/budgets/${newId}`);
    },
    onError: (e: Error) => toast({ title: t("bd.cloneFailed"), description: e.message, variant: "destructive" }),
  });

  const exportCsv = ()=>{    if(!ledger) return;
    const rows = [["date","type","debit","credit","description"], ...ledger.map(l=>[l.created_at, l.reference_type, String(l.debit), String(l.credit), (l.description??"").replace(/,/g," ")])];
    const csv = rows.map(r=>r.join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`reconciliation-${id}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if(!budget) return <div className="p-4 text-sm text-muted-foreground">{t("common.loading")}</div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between gap-2"><div><h1 className="text-2xl font-bold">{budget.name} <Badge variant={healthVariant} className="ml-1 align-middle">{healthLabel}</Badge></h1><p className="text-sm text-muted-foreground">{formatMoney(Number(budget.total_amount),budget.currency)} total • {formatMoney(Number(budget.allocated_amount),budget.currency)} allocated • {formatMoney(Number(budget.available_amount),budget.currency)} available</p></div><div className="flex gap-2 shrink-0"><Button variant="outline" onClick={exportCsv}>{t("bd.export")}</Button>{isOwner && <Button variant="outline" onClick={()=>clone.mutate()} disabled={clone.isPending}>{clone.isPending ? t("common.loading") : t("bd.clone")}</Button>}</div></div>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">{t("bd.aiTitle")} <Badge variant="secondary">{t("bd.movements", { n: insights.movementCount })}</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1 text-sm">
          {insights.narrative.map((line, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{line}</span></li>)}
        </ul>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">{t("bd.burnRate")}</div><div className="font-bold">{formatMoney(Number(insights.burnRate30d), budget.currency)}/day</div></div>
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">{t("bd.runway")}</div><div className="font-bold">{insights.runwayDays === null ? "—" : t("bd.days", { n: insights.runwayDays })}</div></div>
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">{t("bd.pendingExp")}</div><div className="font-bold">{formatMoney(Number(insights.pendingExposure), budget.currency)} ({insights.pendingCount})</div></div>
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">{t("bd.largest")}</div><div className="font-bold">{insights.largestSpend ? formatMoney(Number(insights.largestSpend.amount), budget.currency) : "—"}</div></div>
        </div>
        {insights.topCategories.length > 0 && <div className="space-y-2">
          <div className="text-sm font-semibold">{t("bd.topCats")}</div>
          {insights.topCategories.map((c) => <div key={c.name} className="flex items-center gap-2 text-sm"><span className="w-24 truncate">{c.name}</span><div className="h-2 flex-1 rounded bg-muted overflow-hidden"><div className="h-2 rounded bg-primary" style={{ width: `${c.share}%` }} /></div><span className="whitespace-nowrap">{formatMoney(Number(c.total), budget.currency)} ({c.share}%)</span></div>)}
        </div>}
        {insights.anomalies.length > 0 && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-1">
          <div className="font-semibold">{t("bd.attention")}</div>
          {insights.anomalies.map((a, i) => <div key={i}>• {a}</div>)}
        </div>}
        {series.length > 0 && <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={series}><defs><linearGradient id="bdAreaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} /></linearGradient></defs><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="cumulative" name="Net spend" stroke="#3b82f6" fill="url(#bdAreaGrad)" /></AreaChart></ResponsiveContainer>
        </div>}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>{t("bd.ledger")}</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>{t("bd.date")}</TableHead><TableHead>{t("bd.type")}</TableHead><TableHead>{t("bd.debit")}</TableHead><TableHead>{t("bd.credit")}</TableHead><TableHead>{t("bd.description")}</TableHead></TableRow></TableHeader>
      <TableBody>{ledger?.map(l=> <TableRow key={l.id}><TableCell>{formatDateTime(l.created_at, lang)}</TableCell><TableCell>{l.reference_type}</TableCell><TableCell>{l.debit>0?formatMoney(Number(l.debit),budget.currency):"-"}</TableCell><TableCell>{l.credit>0?formatMoney(Number(l.credit),budget.currency):"-"}</TableCell><TableCell>{l.description}</TableCell></TableRow>)}
      {ledger?.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("bd.noLedger")}</TableCell></TableRow>}
      </TableBody></Table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("bd.requestsIn")}</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>{t("bd.merchant")}</TableHead><TableHead>{t("bd.amount")}</TableHead><TableHead>{t("bd.status")}</TableHead><TableHead>{t("bd.date")}</TableHead></TableRow></TableHeader>
      <TableBody>{requests?.map(r=> <TableRow key={r.id}><TableCell>{r.merchant ?? r.category}</TableCell><TableCell>{formatMoney(Number(r.amount),budget.currency)}</TableCell><TableCell>{r.status}</TableCell><TableCell>{formatDate(r.created_at, lang)}</TableCell></TableRow>)}
      {requests?.length===0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("bd.noRequests")}</TableCell></TableRow>}
      </TableBody></Table>
    </CardContent></Card>
  </div>;
}
