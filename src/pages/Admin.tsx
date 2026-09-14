import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { reconciliationScore } from "@/lib/matcher";
import { approvalRisk } from "@/lib/advisor";
import { useToast } from "@/components/ui/toast";
import { useRealtime } from "@/hooks/useRealtime";
import { normalizeCategory, useCategories } from "@/hooks/useCategories";
import { useLang } from "@/i18n/LanguageContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Budget = { id: string; name: string; total_amount: number; allocated_amount: number; available_amount: number; currency: string; status: string };
type Req = { id: string; budget_id: string; amount: number; category: string; merchant: string | null; status: string; created_at: string; receipt_url: string | null; due_date: string | null };
type Ledger = { id: string; budget_id: string; debit: number; credit: number; reference_type: string; description: string | null; created_at: string };
type Profile = { id: string; email: string; display_name: string | null; role: string; created_at: string };

async function fetchAll<T>(table: string, orderBy = "created_at", ascending = false, limit?: number): Promise<T[]> {
  let q = supabase.from(table).select("*").order(orderBy, { ascending });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export default function Admin() {
  useRealtime();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t, lang } = useLang();
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [topups, setTopups] = React.useState<Record<string, string>>({});
  const [limit, setLimit] = React.useState(100);
  const [resetText, setResetText] = React.useState("");
  const { categories } = useCategories();
  const [newCat, setNewCat] = React.useState("");
  const [catErr, setCatErr] = React.useState<string | null>(null);
  const usageCount = (name: string) => (requests ?? []).filter((r) => r.category === name).length;

  const { data: budgets } = useQuery({ queryKey: ["budgets"], queryFn: () => fetchAll<Budget>("budgets") });
  const { data: requests } = useQuery({ queryKey: ["requests"], queryFn: () => fetchAll<Req>("reimbursement_requests") });
  const { data: ledger } = useQuery({ queryKey: ["admin-ledger", limit], queryFn: () => fetchAll<Ledger>("ledger_entries", "created_at", false, limit) });
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchAll<Profile>("profiles") });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["budgets"] });
    qc.invalidateQueries({ queryKey: ["requests"] });
    qc.invalidateQueries({ queryKey: ["admin-ledger"] });
  };

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("approve_request", { p_request_id: id });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: t("admin.approvedMsg") }); },
    onError: (e: Error) => toast({ title: t("admin.failApprove"), description: e.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_request", { p_request_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setReasons({}); toast({ title: t("admin.rejectedMsg") }); },
    onError: (e: Error) => toast({ title: t("admin.failReject"), description: e.message, variant: "destructive" }),
  });

  const topup = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await supabase.rpc("topup_budget", { p_budget_id: id, p_amount: amount, p_description: "Admin top-up" });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setTopups({}); toast({ title: t("admin.toppedUp") }); },
    onError: (e: Error) => toast({ title: t("admin.failTopup"), description: e.message, variant: "destructive" }),
  });

  const addCat = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("categories").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => { setNewCat(""); setCatErr(null); qc.invalidateQueries({ queryKey: ["categories"] }); toast({ title: t("admin.catAdded") }); },
    onError: (e: Error) => toast({ title: t("admin.catFailed"), description: e.message, variant: "destructive" }),
  });

  const delCat = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("categories").delete().eq("name", name);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); toast({ title: t("admin.catDeleted") }); },
    onError: (e: Error) => toast({ title: t("admin.catFailed"), description: e.message, variant: "destructive" }),
  });

  const onAddCat = () => {
    const name = normalizeCategory(newCat);
    if (!name) { setCatErr(t("admin.catsHint")); return; }
    setCatErr(null);
    addCat.mutate(name);
  };

  type Proposal = { id: string; requester_id: string; name: string; merchant: string | null; status: string; created_at: string };
  const { data: proposals } = useQuery({
    queryKey: ["cat-proposals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("category_proposals").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Proposal[];
    },
  });
  const pendingProps = React.useMemo(() => (proposals ?? []).filter((p) => p.status === "pending"), [proposals]);
  const userEmail = (id: string) => users?.find((u) => u.id === id)?.email ?? String(id || "").slice(0, 8);

  const notifyRequester = async (userId: string, title: string, body: string) => {
    await supabase.from("notifications").insert({ user_id: userId, type: "category_decision", title, body, link: "/requests/new" });
  };

  const approveProp = useMutation({
    mutationFn: async (p: Proposal) => {
      const { error: e1 } = await supabase.from("categories").upsert({ name: p.name }, { onConflict: "name" });
      if (e1) throw e1;
      const { data: { user } } = await supabase.auth.getUser();
      const { error: e2 } = await supabase.from("category_proposals").update({ status: "approved", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() }).eq("id", p.id);
      if (e2) throw e2;
      await notifyRequester(p.requester_id, t("admin.propApproved"), p.name);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cat-proposals"] }); qc.invalidateQueries({ queryKey: ["categories"] }); toast({ title: t("admin.propApproved") }); },
    onError: (e: Error) => toast({ title: t("admin.propFailed"), description: e.message, variant: "destructive" }),
  });

  const rejectProp = useMutation({
    mutationFn: async (p: Proposal) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("category_proposals").update({ status: "rejected", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() }).eq("id", p.id);
      if (error) throw error;
      await notifyRequester(p.requester_id, t("admin.propRejected"), p.name);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cat-proposals"] }); toast({ title: t("admin.propRejected") }); },
    onError: (e: Error) => toast({ title: t("admin.propFailed"), description: e.message, variant: "destructive" }),
  });

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const totalBudget = (budgets ?? []).reduce((s, b) => s + Number(b.total_amount), 0);
  const totalAllocated = (budgets ?? []).reduce((s, b) => s + Number(b.allocated_amount), 0);
  const reconciledCount = (requests ?? []).filter((r) => r.status === "reconciled").length;

  const byCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests ?? []) {
      if (r.status === "approved" || r.status === "reconciled") {
        map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount));
      }
    }
    return [...map.entries()].map(([name, total]) => ({ name, total }));
  }, [requests]);

  const budgetName = (id: string) => budgets?.find((b) => b.id === id)?.name ?? String(id || "").slice(0, 8);
  const riskOf = (r: Req) => {
    const b = budgets?.find((x) => x.id === r.budget_id);
    return approvalRisk(
      { merchant: r.merchant, amount: r.amount, category: r.category, status: r.status, created_at: r.created_at, receipt_url: r.receipt_url },
      b ? { available_amount: b.available_amount, total_amount: b.total_amount } : null,
      (requests ?? []).map((x) => ({ merchant: x.merchant, amount: x.amount, category: x.category, status: x.status, created_at: x.created_at })),
      lang
    );
  };
  const riskMeta = {
    safe: { variant: "approved" as const, label: t("risk.safe") },
    review: { variant: "pending" as const, label: t("risk.review") },
    risky: { variant: "destructive" as const, label: t("risk.risky") },
  };

  const approved = React.useMemo(() => (requests ?? []).filter((r) => r.status === "approved"), [requests]);
  const knownMerchants = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of requests ?? []) {
      const m = (r.merchant ?? "").trim().toLowerCase();
      if (m) s.add(m);
    }
    return s;
  }, [requests]);
  const availableOf = (budgetId: string) => {
    const b = budgets?.find((x) => x.id === budgetId);
    return b ? Number(b.available_amount) : 0;
  };
  const scoreOf = (r: Req) => reconciliationScore({
    amount: r.amount,
    receiptUrl: r.receipt_url,
    dueDate: r.due_date,
    available: availableOf(r.budget_id),
    knownMerchant: knownMerchants.has((r.merchant ?? "").trim().toLowerCase()),
    lang,
  });

  const [bulk, setBulk] = React.useState({ running: false, done: 0, total: 0 });
  const reconcileOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("reconcile_request", { p_request_id: id, p_note: "" });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: t("admin.reconciledOne") }); },
    onError: (e: Error) => toast({ title: t("admin.failRecon"), description: e.message, variant: "destructive" }),
  });

  const resetDb = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reset_all_data");
      if (error) throw error;
      return (data ?? {}) as Record<string, number>;
    },
    onSuccess: (counts) => {
      setResetText("");
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["admin-ledger"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      const total = Object.values(counts).reduce((s, n) => s + (Number(n) || 0), 0);
      toast({ title: `${t("admin.resetDone")} — ${total} rows` });
    },
    onError: (e: unknown) => {
      const err = e as { message?: string; code?: string; hint?: string | null; details?: string | null };
      const extra = [err.code, err.hint ?? err.details].filter(Boolean).join(" • ");
      toast({
        title: t("admin.resetFailed"),
        description: [err.message, extra].filter(Boolean).join(" — ") || String(e),
        variant: "destructive",
      });
    },
  });

  const bulkReconcile = async (threshold: number) => {    const targets = approved.filter((r) => scoreOf(r).score >= threshold);
    if (targets.length === 0 || bulk.running) return;
    setBulk({ running: true, done: 0, total: targets.length });
    let ok = 0;
    for (const r of targets) {
      const { error } = await supabase.rpc("reconcile_request", { p_request_id: r.id, p_note: "Bulk auto-reconcile" });
      if (!error) ok++;
      setBulk((b) => ({ ...b, done: b.done + 1 }));
    }
    invalidate();
    setBulk({ running: false, done: 0, total: 0 });
    toast({ title: t("admin.bulkDone", { done: ok, failed: targets.length - ok }) });
  };

  const exportCsv = () => {
    if (!ledger) return;
    const rows = [["date", "budget", "type", "debit", "credit", "description"],
      ...ledger.map((l) => [l.created_at, budgetName(l.budget_id), l.reference_type, String(l.debit), String(l.credit), (l.description ?? "").replace(/,/g, " ")])];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "admin-ledger.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-primary to-blue-500 text-primary-foreground p-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
          <p className="text-sm opacity-90">{t("admin.sub")}</p>
        </div>
        <Button variant="secondary" onClick={exportCsv}>{t("admin.export")}</Button>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t("admin.totalBudgets")}</CardTitle></CardHeader><CardContent><div className="stat-value">{formatMoney(totalBudget)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t("admin.allocated")}</CardTitle></CardHeader><CardContent><div className="stat-value">{formatMoney(totalAllocated)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t("admin.pending")}</CardTitle></CardHeader><CardContent><div className="stat-value">{pending.length}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t("admin.recUsers")}</CardTitle></CardHeader><CardContent><div className="stat-value">{reconciledCount} / {users?.length ?? 0}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("admin.queue")} {pending.length > 0 && <Badge variant="pending" className="ml-2">{t("admin.waiting", { n: pending.length })}</Badge>}</CardTitle></CardHeader>
        <CardContent>
          {pending.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.clear")}</div> :
          <Table><TableHeader><TableRow><TableHead>{t("admin.qRequest")}</TableHead><TableHead>{t("admin.qBudget")}</TableHead><TableHead>{t("admin.qAmount")}</TableHead><TableHead>{t("risk.title")}</TableHead><TableHead>{t("admin.qReason")}</TableHead><TableHead>{t("admin.qActions")}</TableHead></TableRow></TableHeader>
          <TableBody>{pending.map((r) => (
            <TableRow key={r.id}>
              <TableCell><Link to={`/requests/${r.id}`} className="text-primary underline">{r.merchant ?? r.category}</Link><div className="text-xs text-muted-foreground">{r.category} • {formatDate(r.created_at, lang)}</div></TableCell>
              <TableCell>{budgetName(r.budget_id)}</TableCell>
              <TableCell>{formatMoney(Number(r.amount))}</TableCell>
              <TableCell><Badge variant={riskMeta[riskOf(r).level].variant} title={riskOf(r).reasons.join(" • ")}>{riskMeta[riskOf(r).level].label}</Badge></TableCell>
              <TableCell><Input placeholder={t("admin.reasonPh")} value={reasons[r.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} className="min-w-[160px]" /></TableCell>
              <TableCell><div className="flex gap-2">
                <Button size="sm" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>{t("admin.approve")}</Button>
                <Button size="sm" variant="destructive" onClick={() => reject.mutate({ id: r.id, reason: (reasons[r.id] ?? "").trim() })} disabled={reject.isPending || (reasons[r.id] ?? "").trim().length < 3}>{t("admin.reject")}</Button>
              </div></TableCell>
            </TableRow>))}
          </TableBody></Table>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-bold flex items-center gap-2">{t("admin.inbox")} {approved.length > 0 && <Badge variant="secondary" className="bg-white text-slate-900">{t("admin.ready", { n: approved.length })}</Badge>}</div>
              <div className="text-xs text-white/70">{t("admin.inboxSub")}</div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => bulkReconcile(80)} disabled={bulk.running || reconcileOne.isPending || approved.filter((r) => scoreOf(r).score >= 80).length === 0}>
              {bulk.running ? t("admin.reconciling", { done: bulk.done, total: bulk.total }) : t("admin.reconcileAll", { n: 80 })}
            </Button>
          </div>
        </div>
        <CardContent className="pt-4">
          {approved.length === 0 ? <div className="text-sm text-muted-foreground py-4 text-center">{t("admin.noApproved")}</div> : (() => {
            const ready = approved.filter((r) => scoreOf(r).score >= 80);
            const review = approved.filter((r) => scoreOf(r).score < 80);
            const KanbanCard = ({ r }: { r: typeof approved[0] }) => {
              const s = scoreOf(r);
              const ring = s.score >= 80 ? "border-emerald-500" : s.score >= 50 ? "border-amber-500" : "border-slate-300";
              return (
                <div key={r.id} className={`rounded-xl border bg-card p-3 shadow-sm hover:shadow-md transition-shadow border-l-4 ${ring} space-y-2`}>
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/requests/${r.id}`} className="font-medium text-sm text-primary underline line-clamp-1">{r.merchant ?? r.category}</Link>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded tabular ${s.score >= 80 ? "bg-emerald-500 text-white" : s.score >= 50 ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"}`}>{s.score}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatMoney(Number(r.amount))} • {budgetName(r.budget_id)}</div>
                  <div className="h-1.5 rounded bg-muted overflow-hidden"><div className={`h-1.5 rounded ${s.score >= 80 ? "bg-emerald-500" : s.score >= 50 ? "bg-amber-500" : "bg-slate-400"}`} style={{ width: `${s.score}%` }} /></div>
                  <div className="text-[11px] text-muted-foreground line-clamp-2">{s.reasons.slice(0,2).join(" • ")}</div>
                  <Button size="sm" className="w-full h-7 text-xs" onClick={() => reconcileOne.mutate(r.id)} disabled={reconcileOne.isPending || bulk.running}>{t("admin.reconcile")}</Button>
                </div>
              );
            };
            return (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t("admin.kanbanReady")} <Badge variant="approved">{ready.length}</Badge></div>
                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2 space-y-2 min-h-[120px]">
                    {ready.length === 0 ? <div className="text-xs text-muted-foreground py-6 text-center">{t("admin.kanbanEmpty")}</div> : ready.map((r) => <KanbanCard key={r.id} r={r} />)}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-amber-500" />{t("admin.kanbanReview")} <Badge variant="secondary">{review.length}</Badge></div>
                  <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2 space-y-2 min-h-[120px]">
                    {review.length === 0 ? <div className="text-xs text-muted-foreground py-6 text-center">{t("admin.kanbanEmpty")}</div> : review.map((r) => <KanbanCard key={r.id} r={r} />)}
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>{t("admin.spendCat")}</CardTitle></CardHeader><CardContent className="h-[260px]">
          {byCategory.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noSpend")}</div> :
          <ResponsiveContainer width="100%" height="100%"><BarChart data={byCategory}><defs><linearGradient id="adminCatGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" /><stop offset="100%" stopColor="#2563eb" /></linearGradient></defs><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="total" fill="url(#adminCatGrad)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{t("admin.users")}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{t("admin.email")}</TableHead><TableHead>{t("admin.name")}</TableHead><TableHead>{t("admin.role")}</TableHead></TableRow></TableHeader>
          <TableBody>{users?.map((u) => (
            <TableRow key={u.id}><TableCell className="whitespace-nowrap"><span className="flex items-center gap-2"><UserAvatar userId={u.id} name={u.display_name ?? u.email} className="h-7 w-7 text-[10px]" />{u.email}</span></TableCell><TableCell>{u.display_name ?? "—"}</TableCell>
            <TableCell><Badge variant={u.role === "owner" ? "default" : "secondary"} className="capitalize">{u.role}</Badge></TableCell></TableRow>))}
          </TableBody></Table>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("admin.cats")}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map((c) => {
              const used = usageCount(c);
              return (
                <span key={c} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
                  {c}
                  {used > 0
                    ? <span className="text-xs text-muted-foreground">{t("admin.inUse", { n: used })}</span>
                    : <button onClick={() => delCat.mutate(c)} disabled={delCat.isPending} className="text-destructive hover:opacity-70 text-base leading-none" aria-label={`Delete ${c}`}>×</button>}
                </span>
              );
            })}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 max-w-md">
            <Input placeholder={t("admin.catPh")} value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={30} />
            <Button onClick={onAddCat} disabled={addCat.isPending}>{addCat.isPending ? t("common.loading") : t("admin.add")}</Button>
          </div>
          {catErr
            ? <div className="text-sm text-destructive mt-2">{catErr}</div>
            : <div className="text-xs text-muted-foreground mt-2">{t("admin.catsHint")}</div>}
          <div className="mt-4 border-t pt-3">
            <div className="text-sm font-semibold mb-2">{t("admin.props")} {pendingProps.length > 0 && <Badge variant="pending" className="ml-1">{pendingProps.length}</Badge>}</div>
            {pendingProps.length === 0 ? <div className="text-xs text-muted-foreground">{t("admin.noProps")}</div> :
            <div className="space-y-2">
              {pendingProps.map((p) => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border p-2 text-sm">
                  <span className="font-medium">{p.name}</span>
                  {p.merchant && <span className="text-muted-foreground">· {p.merchant}</span>}
                  <span className="text-xs text-muted-foreground">{t("admin.proposedBy", { email: userEmail(p.requester_id) })}</span>
                  <span className="flex gap-2 sm:ml-auto">
                    <Button size="sm" onClick={() => approveProp.mutate(p)} disabled={approveProp.isPending}>{t("admin.approveProp")}</Button>
                    <Button size="sm" variant="destructive" onClick={() => rejectProp.mutate(p)} disabled={rejectProp.isPending}>{t("admin.rejectProp")}</Button>
                  </span>
                </div>
              ))}
            </div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("admin.budgetsTopup")}</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow><TableHead>{t("admin.bName")}</TableHead><TableHead>{t("admin.bTotal")}</TableHead><TableHead>{t("admin.bAvail")}</TableHead><TableHead>{t("admin.bStatus")}</TableHead><TableHead>{t("admin.topupCol")}</TableHead></TableRow></TableHeader>
          <TableBody>{budgets?.map((b) => (
            <TableRow key={b.id}>
              <TableCell><Link to={`/budgets/${b.id}`} className="text-primary underline">{b.name}</Link></TableCell>
              <TableCell>{formatMoney(Number(b.total_amount), b.currency)}</TableCell>
              <TableCell>{formatMoney(Number(b.available_amount), b.currency)}</TableCell>
              <TableCell><Badge variant={b.status === "active" ? "approved" : "secondary"}>{b.status}</Badge></TableCell>
              <TableCell><div className="flex gap-2">
                <Input placeholder={t("admin.amountPh")} value={topups[b.id] ?? ""} onChange={(e) => setTopups({ ...topups, [b.id]: e.target.value })} className="max-w-[140px]" />
                <Button size="sm" variant="outline" onClick={() => topup.mutate({ id: b.id, amount: Number(topups[b.id]) })} disabled={topup.isPending || !(Number(topups[b.id]) > 0)}>{t("admin.topup")}</Button>
              </div></TableCell>
            </TableRow>))}
          </TableBody></Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("admin.ledger", { n: limit })}</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow><TableHead>{t("admin.lDate")}</TableHead><TableHead>{t("admin.lBudget")}</TableHead><TableHead>{t("admin.lType")}</TableHead><TableHead>{t("admin.lDebit")}</TableHead><TableHead>{t("admin.lCredit")}</TableHead></TableRow></TableHeader>
          <TableBody>{ledger?.map((l) => (
            <TableRow key={l.id}><TableCell>{formatDateTime(l.created_at, lang)}</TableCell><TableCell>{budgetName(l.budget_id)}</TableCell><TableCell>{l.reference_type}</TableCell>
            <TableCell>{l.debit > 0 ? formatMoney(Number(l.debit)) : "-"}</TableCell><TableCell>{l.credit > 0 ? formatMoney(Number(l.credit)) : "-"}</TableCell></TableRow>))}
          </TableBody></Table>
          {(ledger?.length ?? 0) >= limit && <Button variant="outline" className="mt-3" onClick={()=>setLimit((l)=>l + 100)}>{t("admin.loadMore")}</Button>}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader><CardTitle className="text-destructive">{t("admin.danger")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("admin.dangerDesc")}</p>
          <div className="text-sm">
            <span className="font-medium">{t("admin.willDelete")}</span>{" "}
            {(budgets?.length ?? 0)} budgets • {(requests?.length ?? 0)} requests • {(ledger?.length ?? 0)} ledger
          </div>
          <div className="text-xs text-muted-foreground">{t("admin.kept")}</div>
          <div className="flex flex-col sm:flex-row gap-2 max-w-md">
            <Input placeholder="RESET" value={resetText} onChange={(e) => setResetText(e.target.value)} className="sm:max-w-[200px]" />
            <Button
              variant="destructive"
              disabled={resetDb.isPending || resetText !== "RESET"}
              onClick={() => resetDb.mutate()}
            >
              {resetDb.isPending ? t("admin.resetting") : t("admin.resetBtn")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("admin.typeReset")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
