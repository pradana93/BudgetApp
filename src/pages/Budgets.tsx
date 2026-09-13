import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { formatMoney, isValidMoney } from "@/lib/money";
import { budgetHealth } from "@/lib/insights";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { Link } from "react-router-dom";
import { useRealtime } from "@/hooks/useRealtime";
import { useLang } from "@/i18n/LanguageContext";
import { Wallet } from "lucide-react";
import { getBudgetSchema } from "@/schemas/budget";

export default function Budgets(){
  useRealtime();
  const { profile } = useSession();
  const { t } = useLang();
  const isOwner = profile?.role==="owner";
  const qc=useQueryClient(); const { toast }=useToast();
  const [open,setOpen]=React.useState(false);
  const [form,setForm]=React.useState({ name:"", total_amount:"", currency:"IDR", period_start:"", period_end:"" });
  const [fieldErrs,setFieldErrs]=React.useState<Record<string, string[]>>({});

  const schema = React.useMemo(
    () => getBudgetSchema({ nameRequired: t("v.nameRequired"), invalidAmount: t("v.invalidAmount"), endGteStart: t("v.endGteStart") }),
    [t]
  );

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
  const mut = useMutation({ mutationFn: async()=>{
    const parsed = schema.parse({ ...form });
    const { error } = await supabase.from("budgets").insert({ name: parsed.name, total_amount: Number(parsed.total_amount), currency: parsed.currency ?? "IDR", period_start: parsed.period_start || null, period_end: parsed.period_end || null, owner_id: profile!.id });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["budgets"]}); setOpen(false); setFieldErrs({}); setForm({ name:"", total_amount:"", currency:"IDR", period_start:"", period_end:"" }); toast({title:t("budgets.created")}); }, onError:(e:Error)=> toast({title:t("budgets.failed"), description:e.message, variant:"destructive"}) });

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

  const onCreate = ()=>{
    const r = schema.safeParse({...form});
    if (!r.success) { setFieldErrs(r.error.flatten().fieldErrors as Record<string, string[]>); return; }
    setFieldErrs({});
    mut.mutate();
  };

  const bump = (n: number) => setForm({ ...form, total_amount: String((Number(form.total_amount) || 0) + n) });
  const periodDays = form.period_start && form.period_end
    ? Math.max(0, Math.round((new Date(form.period_end).getTime() - new Date(form.period_start).getTime()) / 86400000))
    : null;

  return <div className="space-y-4">
    <div className="flex flex-wrap justify-between items-center gap-2"><h1 className="text-2xl font-bold">{t("budgets.title")}</h1><div className="flex gap-2">
      <Input placeholder={t("budgets.searchPh")} value={bq} onChange={(e)=>setBq(e.target.value)} className="max-w-[200px]" />
      <Button variant="outline" onClick={exportCsv}>{t("budgets.export")}</Button>
      {isOwner && <Button onClick={()=>setOpen(true)}>{t("budgets.new")}</Button>}
    </div></div>
    <Card><CardHeader><CardTitle>{t("budgets.all")}</CardTitle></CardHeader><CardContent>
      {isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12" />)}</div>
      : (data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center animate-fade-up">
          <span className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3 text-white shadow-lg"><Wallet className="h-6 w-6" /></span>
          <div className="font-medium">{t("budgets.noBudgets")}</div>
          {isOwner && <Button onClick={()=>setOpen(true)}>{t("budgets.new")}</Button>}
        </div>
      ) : (
      <Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>{t("budgets.name")}</TableHead><TableHead>{t("budgets.total")}</TableHead><TableHead>{t("budgets.allocated")}</TableHead><TableHead>{t("budgets.available")}</TableHead><TableHead>{t("budgets.usage")}</TableHead><TableHead>{t("budgets.status")}</TableHead>{isOwner && <TableHead>{t("budgets.action")}</TableHead>}</TableRow></TableHeader>
      <TableBody>{filteredBudgets?.map(b=> <TableRow key={b.id}><TableCell><Link to={`/budgets/${b.id}`} className="text-primary underline">{b.name}</Link></TableCell><TableCell>{formatMoney(Number(b.total_amount), b.currency)}</TableCell><TableCell>{formatMoney(Number(b.allocated_amount), b.currency)}</TableCell><TableCell>{formatMoney(Number(b.available_amount), b.currency)}</TableCell><TableCell><div className="h-2 w-28 rounded bg-muted overflow-hidden" title={t("budgets.usedPct", { pct: usagePct(b).toFixed(1) })}><div className="h-2 rounded bg-primary" style={{ width: `${usagePct(b)}%` }} /></div></TableCell><TableCell><span className="flex flex-wrap gap-1"><Badge variant={b.status==="active"?"approved":"secondary"}>{b.status}</Badge><Badge variant={healthMeta[healthOf(b)].variant}>{healthMeta[healthOf(b)].label}</Badge></span></TableCell>{isOwner && <TableCell>{b.status === "active"
        ? <Button size="sm" variant="outline" onClick={()=>statusMut.mutate({ id: b.id, status: "closed" })} disabled={statusMut.isPending}>{t("budgets.close")}</Button>
        : <Button size="sm" variant="outline" onClick={()=>statusMut.mutate({ id: b.id, status: "active" })} disabled={statusMut.isPending}>{t("budgets.reopen")}</Button>}</TableCell>}</TableRow>)}
      {filteredBudgets?.length===0 && <TableRow><TableCell colSpan={isOwner ? 7 : 6} className="text-center text-muted-foreground">{t("req.noMatch")}</TableCell></TableRow>}
      </TableBody></Table>)}
    </CardContent></Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader><DialogTitle>{t("budgets.dialogTitle")}</DialogTitle></DialogHeader>
      <DialogContent>
        <div className="grid gap-3">
          <div><Label>{t("budgets.name")}</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder={t("budgets.phName")} maxLength={200} />
            {fieldErrs.name?.[0] && <div className="text-sm text-destructive mt-1">{fieldErrs.name[0]}</div>}</div>
          <div><Label>{t("budgets.fTotalAmt")} ({form.currency})</Label><Input value={form.total_amount} onChange={e=>setForm({...form,total_amount:e.target.value})} placeholder={t("budgets.phTotal")} inputMode="decimal" />
            {fieldErrs.total_amount?.[0] && <div className="text-sm text-destructive mt-1">{fieldErrs.total_amount[0]}</div>}
            {form.currency === "IDR" && <div className="flex gap-2 mt-2">
              {[1000000, 5000000, 10000000].map((n) => <Button key={n} type="button" size="sm" variant="outline" onClick={()=>bump(n)}>+{(n / 1000000).toLocaleString()} jt</Button>)}
            </div>}</div>
          <div><Label>{t("budgets.currency")}</Label><Select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option value="IDR">IDR</option><option value="USD">USD</option></Select></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>{t("budgets.fStart")}</Label><Input type="date" value={form.period_start} onChange={e=>setForm({...form,period_start:e.target.value})} /></div><div><Label>{t("budgets.fEnd")}</Label><Input type="date" value={form.period_end} onChange={e=>setForm({...form,period_end:e.target.value})} />
            {fieldErrs.period_end?.[0] && <div className="text-sm text-destructive mt-1">{fieldErrs.period_end[0]}</div>}</div></div>
          {isValidMoney(form.total_amount) && (
            <div className="rounded-lg bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-primary/20 p-3">
              <span className="text-xl font-bold tabular text-gradient">{formatMoney(Number(form.total_amount), form.currency || "IDR")}</span>
              {periodDays !== null && <span className="ml-2 text-sm text-muted-foreground">• {t("budgets.periodDays", { n: periodDays })}</span>}
            </div>
          )}
        </div>
      </DialogContent>
      <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>{t("common.cancel")}</Button><Button onClick={onCreate} disabled={mut.isPending}>{mut.isPending?t("budgets.creating"):t("budgets.create")}</Button></DialogFooter>
    </Dialog>
  </div>;
}
