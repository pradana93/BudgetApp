import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { budgetHealth } from "@/lib/insights";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { Link, useNavigate } from "react-router-dom";
import { useRealtime } from "@/hooks/useRealtime";
import { useLang } from "@/i18n/LanguageContext";
import { Wallet } from "lucide-react";

export default function Budgets(){
  useRealtime();
  const { profile } = useSession();
  const { t } = useLang();
  const nav = useNavigate();
  const isOwner = profile?.role==="owner";
  const qc=useQueryClient(); const { toast }=useToast();

  const { data, isLoading } = useQuery({ queryKey:["budgets"], queryFn: async()=>{
    const { data, error } = await supabase.from("budgets").select("*").order("created_at",{ascending:false}); if(error) throw error; return data;
  }});
  const { data: allReqs } = useQuery({ queryKey:["requests"], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("budget_id,amount,status"); if(error) throw error; return data;
  }});
  const healthOf = (b: { id: string; allocated_amount: number | string; total_amount: number | string; available_amount: number | string }) => {
    const exposure = (allReqs ?? []).filter((r) => r.budget_id === b.id && r.status === "pending").reduce((s, r) => s + Number(r.amount), 0);
    return budgetHealth({ allocated: b.allocated_amount, total: b.total_amount, available: b.available_amount, pendingExposure: exposure, runwayDays: null });
  };
  const healthMeta = {
    onTrack: { variant: "approved" as const, label: t("health.onTrack") },
    atRisk: { variant: "pending" as const, label: t("health.atRisk") },
    over: { variant: "destructive" as const, label: t("health.over") },
  };
  const statusMut = useMutation({ mutationFn: async({ id, status }: { id: string; status: "active" | "closed" })=>{
    const { error } = await supabase.from("budgets").update({ status }).eq("id", id);
    if(error) throw error;
  }, onSuccess:(_, v)=>{ qc.invalidateQueries({queryKey:["budgets"]}); toast({title: v.status === "closed" ? t("budgets.closed") : t("budgets.reopened")}); }, onError:(e:Error)=> toast({title:t("budgets.failed"), description:e.message, variant:"destructive"}) });

  const usagePct = (b: { total_amount: number | string; allocated_amount: number | string }) => {
    const total = Number(b.total_amount);
    if (!(total > 0)) return 0;
    return Math.min(100, Math.max(0, (Number(b.allocated_amount) / total) * 100));
  };

  const [bq, setBq] = React.useState("");
  const filteredBudgets = React.useMemo(() => {
    const needle = bq.trim().toLowerCase();
    return (data ?? []).filter((b) => !needle || b.name.toLowerCase().includes(needle));
  }, [data, bq]);

  const exportCsv = () => {
    if (!data) return;
    const rows = [["name", "total", "allocated", "available", "currency", "status"],
      ...data.map((b) => [b.name, String(b.total_amount), String(b.allocated_amount), String(b.available_amount ?? ""), b.currency, b.status])];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "budgets.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap justify-between items-center gap-2"><h1 className="text-2xl font-bold">{t("budgets.title")}</h1><div className="flex gap-2">
      <Input placeholder={t("budgets.searchPh")} value={bq} onChange={(e)=>setBq(e.target.value)} className="max-w-[200px]" />
      <Button variant="outline" onClick={exportCsv}>{t("budgets.export")}</Button>
          {isOwner && <Button onClick={()=>nav("/budgets/new")}>{t("budgets.new")}</Button>}
    </div></div>
    <Card><CardHeader><CardTitle>{t("budgets.all")}</CardTitle></CardHeader><CardContent>
      {isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12" />)}</div>
      : (data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center animate-fade-up">
          <span className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3 text-white shadow-lg"><Wallet className="h-6 w-6" /></span>
          <div className="font-medium">{t("budgets.noBudgets")}</div>
      {isOwner && <Button onClick={()=>nav("/budgets/new")}>{t("budgets.new")}</Button>}
        </div>
      ) : (
      <Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>{t("budgets.name")}</TableHead><TableHead>{t("budgets.total")}</TableHead><TableHead>{t("budgets.allocated")}</TableHead><TableHead>{t("budgets.available")}</TableHead><TableHead>{t("budgets.usage")}</TableHead><TableHead>{t("budgets.status")}</TableHead>{isOwner && <TableHead>{t("budgets.action")}</TableHead>}</TableRow></TableHeader>
      <TableBody>{filteredBudgets?.map(b=> <TableRow key={b.id}><TableCell><Link to={`/budgets/${b.id}`} className="text-primary underline">{b.name}</Link></TableCell><TableCell>{formatMoney(Number(b.total_amount), b.currency)}</TableCell><TableCell>{formatMoney(Number(b.allocated_amount), b.currency)}</TableCell><TableCell>{formatMoney(Number(b.available_amount), b.currency)}</TableCell><TableCell><div className="h-2 w-28 rounded bg-muted overflow-hidden" title={t("budgets.usedPct", { pct: usagePct(b).toFixed(1) })}><div className="h-2 rounded bg-primary" style={{ width: `${usagePct(b)}%` }} /></div></TableCell><TableCell><span className="flex flex-wrap gap-1"><Badge variant={b.status==="active"?"approved":"secondary"}>{b.status}</Badge><Badge variant={healthMeta[healthOf(b)].variant}>{healthMeta[healthOf(b)].label}</Badge></span></TableCell>{isOwner && <TableCell>{b.status === "active"
        ? <Button size="sm" variant="outline" onClick={()=>statusMut.mutate({ id: b.id, status: "closed" })} disabled={statusMut.isPending}>{t("budgets.close")}</Button>
        : <Button size="sm" variant="outline" onClick={()=>statusMut.mutate({ id: b.id, status: "active" })} disabled={statusMut.isPending}>{t("budgets.reopen")}</Button>}</TableCell>}</TableRow>)}
      {filteredBudgets?.length===0 && <TableRow><TableCell colSpan={isOwner ? 7 : 6} className="text-center text-muted-foreground">{t("req.noMatch")}</TableCell></TableRow>}
      </TableBody></Table>)}
    </CardContent></Card>
  </div>;
}
