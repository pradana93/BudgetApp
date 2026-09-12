import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { useToast } from "@/components/ui/toast";
import { useRealtime } from "@/hooks/useRealtime";
import { useLang } from "@/i18n/LanguageContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Budget = { id: string; name: string; total_amount: number; allocated_amount: number; available_amount: number; currency: string; status: string };
type Req = { id: string; budget_id: string; amount: number; category: string; merchant: string | null; status: string; created_at: string };
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
  const { t } = useLang();
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [topups, setTopups] = React.useState<Record<string, string>>({});
  const [limit, setLimit] = React.useState(100);

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

  const budgetName = (id: string) => budgets?.find((b) => b.id === id)?.name ?? id.slice(0, 8);

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

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t("admin.totalBudgets")}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatMoney(totalBudget)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t("admin.allocated")}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatMoney(totalAllocated)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t("admin.pending")}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{pending.length}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t("admin.recUsers")}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{reconciledCount} / {users?.length ?? 0}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("admin.queue")} {pending.length > 0 && <Badge variant="pending" className="ml-2">{t("admin.waiting", { n: pending.length })}</Badge>}</CardTitle></CardHeader>
        <CardContent>
          {pending.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.clear")}</div> :
          <Table><TableHeader><TableRow><TableHead>{t("admin.qRequest")}</TableHead><TableHead>{t("admin.qBudget")}</TableHead><TableHead>{t("admin.qAmount")}</TableHead><TableHead>{t("admin.qReason")}</TableHead><TableHead>{t("admin.qActions")}</TableHead></TableRow></TableHeader>
          <TableBody>{pending.map((r) => (
            <TableRow key={r.id}>
              <TableCell><Link to={`/requests/${r.id}`} className="text-primary underline">{r.merchant ?? r.category}</Link><div className="text-xs text-muted-foreground">{r.category} • {new Date(r.created_at).toLocaleDateString()}</div></TableCell>
              <TableCell>{budgetName(r.budget_id)}</TableCell>
              <TableCell>{formatMoney(Number(r.amount))}</TableCell>
              <TableCell><Input placeholder={t("admin.reasonPh")} value={reasons[r.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} className="min-w-[160px]" /></TableCell>
              <TableCell><div className="flex gap-2">
                <Button size="sm" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>{t("admin.approve")}</Button>
                <Button size="sm" variant="destructive" onClick={() => reject.mutate({ id: r.id, reason: (reasons[r.id] ?? "").trim() })} disabled={reject.isPending || (reasons[r.id] ?? "").trim().length < 3}>{t("admin.reject")}</Button>
              </div></TableCell>
            </TableRow>))}
          </TableBody></Table>}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>{t("admin.spendCat")}</CardTitle></CardHeader><CardContent className="h-[260px]">
          {byCategory.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noSpend")}</div> :
          <ResponsiveContainer width="100%" height="100%"><BarChart data={byCategory}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="total" fill="#3b82f6" /></BarChart></ResponsiveContainer>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{t("admin.users")}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{t("admin.email")}</TableHead><TableHead>{t("admin.name")}</TableHead><TableHead>{t("admin.role")}</TableHead></TableRow></TableHeader>
          <TableBody>{users?.map((u) => (
            <TableRow key={u.id}><TableCell>{u.email}</TableCell><TableCell>{u.display_name ?? "—"}</TableCell>
            <TableCell><Badge variant={u.role === "owner" ? "default" : "secondary"} className="capitalize">{u.role}</Badge></TableCell></TableRow>))}
          </TableBody></Table>
        </CardContent></Card>
      </div>

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
            <TableRow key={l.id}><TableCell>{new Date(l.created_at).toLocaleString()}</TableCell><TableCell>{budgetName(l.budget_id)}</TableCell><TableCell>{l.reference_type}</TableCell>
            <TableCell>{l.debit > 0 ? formatMoney(Number(l.debit)) : "-"}</TableCell><TableCell>{l.credit > 0 ? formatMoney(Number(l.credit)) : "-"}</TableCell></TableRow>))}
          </TableBody></Table>
          {(ledger?.length ?? 0) >= limit && <Button variant="outline" className="mt-3" onClick={()=>setLimit((l)=>l + 100)}>{t("admin.loadMore")}</Button>}
        </CardContent>
      </Card>
    </div>
  );
}
