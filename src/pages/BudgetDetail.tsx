import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { analyzeBudget, cumulativeSpendSeries } from "@/lib/insights";
import { useLang } from "@/i18n/LanguageContext";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function BudgetDetail(){
  const { id } = useParams();
  const { t } = useLang();
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
    () => analyzeBudget(ledger ?? [], requests ?? [], budget?.available_amount ?? 0, budget?.currency ?? "IDR"),
    [ledger, requests, budget]
  );
  const series = React.useMemo(() => cumulativeSpendSeries(ledger ?? []), [ledger]);

  const exportCsv = ()=>{
    if(!ledger) return;
    const rows = [["date","type","debit","credit","description"], ...ledger.map(l=>[l.created_at, l.reference_type, String(l.debit), String(l.credit), (l.description??"").replace(/,/g," ")])];
    const csv = rows.map(r=>r.join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`reconciliation-${id}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if(!budget) return <div className="p-4 text-sm text-muted-foreground">{t("common.loading")}</div>;
  return <div className="space-y-6">
    <div className="flex justify-between"><div><h1 className="text-2xl font-bold">{budget.name}</h1><p className="text-sm text-muted-foreground">{formatMoney(Number(budget.total_amount),budget.currency)} total • {formatMoney(Number(budget.allocated_amount),budget.currency)} allocated • {formatMoney(Number(budget.available_amount),budget.currency)} available</p></div><Button variant="outline" onClick={exportCsv}>{t("bd.export")}</Button></div>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">{t("bd.aiTitle")} <Badge variant="secondary">{t("bd.movements", { n: insights.movementCount })}</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1 text-sm">
          {insights.narrative.map((line, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{line}</span></li>)}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">Burn rate (30d)</div><div className="font-bold">{formatMoney(Number(insights.burnRate30d), budget.currency)}/day</div></div>
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">Runway</div><div className="font-bold">{insights.runwayDays === null ? "—" : `~${insights.runwayDays} days`}</div></div>
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">Pending exposure</div><div className="font-bold">{formatMoney(Number(insights.pendingExposure), budget.currency)} ({insights.pendingCount})</div></div>
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">Largest spend</div><div className="font-bold">{insights.largestSpend ? formatMoney(Number(insights.largestSpend.amount), budget.currency) : "—"}</div></div>
        </div>
        {insights.anomalies.length > 0 && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-1">
          <div className="font-semibold">Needs attention</div>
          {insights.anomalies.map((a, i) => <div key={i}>• {a}</div>)}
        </div>}
        {series.length > 0 && <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={series}><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="cumulative" name="Net spend" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} /></AreaChart></ResponsiveContainer>
        </div>}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>{t("bd.ledger")}</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>{t("bd.date")}</TableHead><TableHead>{t("bd.type")}</TableHead><TableHead>{t("bd.debit")}</TableHead><TableHead>{t("bd.credit")}</TableHead><TableHead>{t("bd.description")}</TableHead></TableRow></TableHeader>
      <TableBody>{ledger?.map(l=> <TableRow key={l.id}><TableCell>{new Date(l.created_at).toLocaleString()}</TableCell><TableCell>{l.reference_type}</TableCell><TableCell>{l.debit>0?formatMoney(Number(l.debit),budget.currency):"-"}</TableCell><TableCell>{l.credit>0?formatMoney(Number(l.credit),budget.currency):"-"}</TableCell><TableCell>{l.description}</TableCell></TableRow>)}
      {ledger?.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("bd.noLedger")}</TableCell></TableRow>}
      </TableBody></Table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("bd.requestsIn")}</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>{t("bd.merchant")}</TableHead><TableHead>{t("bd.amount")}</TableHead><TableHead>{t("bd.status")}</TableHead><TableHead>{t("bd.date")}</TableHead></TableRow></TableHeader>
      <TableBody>{requests?.map(r=> <TableRow key={r.id}><TableCell>{r.merchant ?? r.category}</TableCell><TableCell>{formatMoney(Number(r.amount),budget.currency)}</TableCell><TableCell>{r.status}</TableCell><TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell></TableRow>)}
      {requests?.length===0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("bd.noRequests")}</TableCell></TableRow>}
      </TableBody></Table>
    </CardContent></Card>
  </div>;
}
