import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { useLang } from "@/i18n/LanguageContext";
import { useToast } from "@/components/ui/toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatMoney, isValidMoney } from "@/lib/money";
import { dateLocale } from "@/lib/datetime";
import { Search, ChevronLeft, ChevronRight, Plus, Trash2, Wallet, ArrowLeftRight, Utensils, Film, Car, Receipt, ShoppingCart, PiggyBank, DollarSign, CreditCard, Landmark, Sparkles, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SwipeRow } from "@/components/SwipeRow";
import { PullToRefresh } from "@/components/PullToRefresh";

type Entry = { id: string; title: string; body: string; amount: number | null; category_id: string | null; direction: "income" | "expense" | "transfer"; entry_date: string; created_at: string; account_id: string | null; transfer_to_account_id: string | null };
type PCat = { id: string; name: string; color: string; monthly_budget: number | null };
type Account = { id: string; name: string; icon: string; color: string; initial_balance: number; created_at: string };

const ICONS: Record<string, React.ElementType> = { wallet: Wallet, cash: DollarSign, bca: CreditCard, bank: Landmark, entertainment: Film, food: Utensils, car: Car, bills: Receipt, shopping: ShoppingCart, investment: PiggyBank, transfer: ArrowLeftRight };
const GRAD: Record<string, string> = { blue: "from-blue-500 to-indigo-500", violet: "from-violet-500 to-purple-500", emerald: "from-emerald-500 to-teal-500", amber: "from-amber-500 to-orange-500", rose: "from-rose-500 to-pink-500", slate: "from-slate-500 to-slate-600", cyan: "from-cyan-500 to-teal-500", orange: "from-orange-500 to-red-500" };

const catIcon = (name?: string | null) => {
  const k = (name ?? "").toLowerCase();
  if (k.includes("entertain")) return Film;
  if (k.includes("food")) return Utensils;
  if (k.includes("transfer")) return ArrowLeftRight;
  if (k.includes("car")) return Car;
  if (k.includes("bill")) return Receipt;
  if (k.includes("shopping")) return ShoppingCart;
  if (k.includes("invest")) return PiggyBank;
  if (k.includes("cash")) return DollarSign;
  return Wallet;
};

export default function Space() {
  const { profile } = useSession();
  const { lang } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const now0 = new Date();
  const [ym, setYm] = React.useState({ y: now0.getFullYear(), m: now0.getMonth() });
  const [q, setQ] = React.useState("");
  const [catFilter, setCatFilter] = React.useState("all");
  const [accFilter, setAccFilter] = React.useState("all");
  const [showAdd, setShowAdd] = React.useState(false);
  const [showAcc, setShowAcc] = React.useState(false);
  const [editing, setEditing] = React.useState<Entry | null>(null);
  const [txType, setTxType] = React.useState<"expense" | "income" | "transfer">("expense");
  const [form, setForm] = React.useState({ title: "", body: "", amount: "", category_id: "", account_id: "", to_account_id: "", entry_date: new Date().toISOString().slice(0,10) });
  const [newAcc, setNewAcc] = React.useState({ name: "", icon: "wallet", color: "blue", initial_balance: "" });
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [formErr, setFormErr] = React.useState<string | null>(null);

  const { data: entries } = useQuery({
    queryKey: ["personal-entries", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_notes").select("id,title,body,amount,category_id,direction,entry_date,created_at,account_id,transfer_to_account_id").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
    enabled: !!profile,
  });
  const { data: cats } = useQuery({
    queryKey: ["personal-cats", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_categories").select("id,name,color,monthly_budget").order("created_at");
      if (error) throw error;
      return (data ?? []) as PCat[];
    },
    enabled: !!profile,
  });
  const { data: accounts } = useQuery({
    queryKey: ["personal-accounts", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_accounts").select("id,name,icon,color,initial_balance,created_at").order("created_at");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
    enabled: !!profile,
  });

  React.useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`ledger-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_notes" }, () => qc.invalidateQueries({ queryKey: ["personal-entries", profile.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_accounts" }, () => qc.invalidateQueries({ queryKey: ["personal-accounts", profile.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_categories" }, () => qc.invalidateQueries({ queryKey: ["personal-cats", profile.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, profile]);

  const accById = (id: string | null) => accounts?.find((a) => a.id === id);
  const catById = (id: string | null) => cats?.find((c) => c.id === id);
  const curKey = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString(dateLocale(lang), { month: "long", year: "numeric" });

  const balances = React.useMemo(() => {
    const map = new Map<string, Decimal>();
    for (const a of accounts ?? []) map.set(a.id, new Decimal(a.initial_balance ?? 0));
    for (const e of entries ?? []) {
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "income" && e.account_id) map.set(e.account_id, (map.get(e.account_id) ?? new Decimal(0)).add(amt));
      else if (e.direction === "expense" && e.account_id) map.set(e.account_id, (map.get(e.account_id) ?? new Decimal(0)).sub(amt));
      else if (e.direction === "transfer" && e.account_id && e.transfer_to_account_id) {
        map.set(e.account_id, (map.get(e.account_id) ?? new Decimal(0)).sub(amt));
        map.set(e.transfer_to_account_id, (map.get(e.transfer_to_account_id) ?? new Decimal(0)).add(amt));
      }
    }
    return map;
  }, [accounts, entries]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (entries ?? []).filter((e) => {
      if (e.entry_date.slice(0,7) !== curKey) return false;
      if (catFilter !== "all" && (e.category_id ?? "none") !== catFilter) return false;
      if (accFilter !== "all" && e.account_id !== accFilter && e.transfer_to_account_id !== accFilter) return false;
      if (needle && !`${e.title} ${e.body} ${(cats ?? []).find((c) => c.id === e.category_id)?.name ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [entries, curKey, catFilter, accFilter, q, cats]);

  const sums = React.useMemo(() => {
    let exp = new Decimal(0), inc = new Decimal(0);
    for (const e of filtered) {
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "expense") exp = exp.add(amt);
      else if (e.direction === "income") inc = inc.add(amt);
    }
    let bal = new Decimal(0);
    for (const a of accounts ?? []) bal = bal.add(new Decimal(a.initial_balance ?? 0));
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) > curKey) continue;
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "income") bal = bal.add(amt);
      else if (e.direction === "expense") bal = bal.sub(amt);
    }
    return { exp, inc, bal };
  }, [filtered, entries, accounts, curKey]);

  const monthTotals = React.useMemo(() => {
    let exp = new Decimal(0), inc = new Decimal(0), expN = 0, incN = 0;
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) !== curKey) continue;
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "expense") { exp = exp.add(amt); expN++; }
      else if (e.direction === "income") { inc = inc.add(amt); incN++; }
    }
    return { exp, inc, expN, incN };
  }, [entries, curKey]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of filtered) {
      const k = e.entry_date.slice(0,10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.entries()].sort((a,b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const shift = (d: number) => setYm((v) => { const dt = new Date(v.y, v.m + d, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; });
  const openAdd = (type: "expense"|"income"|"transfer" = "expense") => { setTxType(type); setForm({ title: "", body: "", amount: "", category_id: cats?.[0]?.id ?? "", account_id: accounts?.[0]?.id ?? "", to_account_id: accounts?.[1]?.id ?? "", entry_date: new Date().toISOString().slice(0,10) }); setEditing(null); setFormErr(null); setShowAdd(true); };
  const openEdit = (e: Entry) => { setEditing(e); setTxType(e.direction as "expense"|"income"|"transfer"); setForm({ title: e.title, body: e.body, amount: e.amount != null ? String(e.amount) : "", category_id: e.category_id ?? "", account_id: e.account_id ?? "", to_account_id: e.transfer_to_account_id ?? "", entry_date: e.entry_date.slice(0,10) }); setFormErr(null); setShowAdd(true); };

  const saveTx = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no user");
      if (!form.title.trim()) { setFormErr("Title is required"); throw new Error("_validation"); }
      if (!isValidMoney(form.amount) || Number(form.amount) <= 0) { setFormErr("Amount must be greater than 0"); throw new Error("_validation"); }
      if (txType !== "transfer" && !form.account_id) { setFormErr("Select a ledger account"); throw new Error("_validation"); }
      if (txType === "transfer" && (!form.account_id || !form.to_account_id)) { setFormErr("Select both From and To accounts"); throw new Error("_validation"); }
      if (txType === "transfer" && form.account_id === form.to_account_id) { setFormErr("From and To accounts must be different"); throw new Error("_validation"); }
      setFormErr(null);
      const payload: Record<string, unknown> = { user_id: profile.id, title: form.title.trim().slice(0,120), body: form.body.slice(0,4000), amount: Number(form.amount), category_id: form.category_id || null, direction: txType, entry_date: form.entry_date, account_id: form.account_id || null, transfer_to_account_id: txType === "transfer" ? form.to_account_id : null };
      if (editing) { const { error } = await supabase.from("personal_notes").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("personal_notes").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { setShowAdd(false); setEditing(null); setFormErr(null); qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }); try { navigator.vibrate?.(15); } catch { /* vibrate not supported */ } toast({ title: "Saved" }); },
    onError: (e: Error) => { if (e.message !== "_validation") toast({ title: "Failed", description: e.message, variant: "destructive" }); },
  });
  const delTx = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("personal_notes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { setConfirmDelete(null); qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }); try { navigator.vibrate?.([10, 30, 10]); } catch { /* vibrate not supported */ } toast({ title: "Deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const createAcc = useMutation({
    mutationFn: async () => {
      if (!profile || !newAcc.name.trim()) throw new Error("Name required");
      const bal = newAcc.initial_balance.trim();
      if (bal && !isValidMoney(bal)) throw new Error("Invalid balance");
      const { error } = await supabase.from("personal_accounts").insert({ user_id: profile.id, name: newAcc.name.trim().slice(0,30), icon: newAcc.icon, color: newAcc.color, initial_balance: bal ? Number(bal) : 0 });
      if (error) throw error;
    },
    onSuccess: () => { setNewAcc({ name: "", icon: "wallet", color: "blue", initial_balance: "" }); setShowAcc(false); qc.invalidateQueries({ queryKey: ["personal-accounts", profile?.id] }); toast({ title: "Account created" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const delAcc = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("personal_accounts").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { setConfirmDelete(null); qc.invalidateQueries({ queryKey: ["personal-accounts", profile?.id] }); qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }); toast({ title: "Account deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const totalBalance = [...balances.values()].reduce((a,b) => a.add(b), new Decimal(0));

  const isLoading = !entries && !cats && !accounts;

  const refresh = React.useCallback(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }), qc.invalidateQueries({ queryKey: ["personal-cats", profile?.id] }), qc.invalidateQueries({ queryKey: ["personal-accounts", profile?.id] })]);
    await new Promise((r) => setTimeout(r, 300));
  }, [qc, profile]);

  return <PullToRefresh onRefresh={refresh}><div className="space-y-3">
    {/* Page Header — matches Budgets/Requests pattern */}
    <div className="flex flex-wrap justify-between items-center gap-2">
      <h1 className="text-2xl font-bold">Personal Ledger</h1>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowAcc(true)}><Plus className="h-4 w-4 mr-1" />Ledger</Button>
        <Button size="sm" onClick={() => openAdd("expense")}><Plus className="h-4 w-4 mr-1" />Transaction</Button>
      </div>
    </div>

    {/* Stats Summary — inside Card like Dashboard */}
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">This Month</CardTitle></CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-2.5 border border-rose-100 dark:border-rose-900/30 overflow-hidden min-w-0">
            <div className="text-[10px] sm:text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1"><TrendingDown className="h-3 w-3" />Spent</div>
            <div className="text-xs sm:text-sm font-bold tabular text-rose-700 dark:text-rose-300 mt-0.5 leading-tight truncate">{formatMoney(monthTotals.exp.toNumber())}</div>
            <div className="text-[10px] text-rose-500/60 mt-0.5">{monthTotals.expN} tx</div>
          </div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-2.5 border border-emerald-100 dark:border-emerald-900/30 overflow-hidden min-w-0">
            <div className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1"><TrendingUp className="h-3 w-3" />Earned</div>
            <div className="text-xs sm:text-sm font-bold tabular text-emerald-700 dark:text-emerald-300 mt-0.5 leading-tight truncate">{formatMoney(monthTotals.inc.toNumber())}</div>
            <div className="text-[10px] text-emerald-500/60 mt-0.5">{monthTotals.incN} tx</div>
          </div>
          <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 p-2.5 border border-violet-100 dark:border-violet-900/30 overflow-hidden min-w-0">
            <div className="text-[10px] sm:text-xs text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1"><Sparkles className="h-3 w-3" />Balance</div>
            <div className="text-xs sm:text-sm font-bold tabular text-violet-700 dark:text-violet-300 mt-0.5 leading-tight truncate">{formatMoney(sums.bal.toNumber())}</div>
            <div className="text-[10px] text-violet-500/60 mt-0.5">{accounts?.length ?? 0} ledgers</div>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Accounts — horizontal scroll inside Card */}
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center justify-between">Ledger Accounts <span className="text-xs font-normal text-muted-foreground">Tap to filter</span></CardTitle></CardHeader>
      <CardContent>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => setAccFilter("all")} className={cn("shrink-0 rounded-lg px-3 py-2 text-left min-w-[100px] border transition-all", accFilter==="all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/30")}>
            <div className="text-[10px] font-medium uppercase tracking-wide">All</div>
            <div className="font-bold text-sm tabular mt-0.5">{formatMoney(totalBalance.toNumber())}</div>
            <div className="text-[11px] opacity-70 mt-0.5">{filtered.length} tx</div>
          </button>
          {accounts?.map((a) => {
            const Icon = ICONS[a.icon] ?? Wallet;
            const bal = balances.get(a.id) ?? new Decimal(0);
            const active = accFilter===a.id;
            return (
              <button key={a.id} onClick={() => setAccFilter(active ? "all" : a.id)} className={cn("shrink-0 rounded-lg px-3 py-2 text-left min-w-[100px] border transition-all relative group/acct", active ? "bg-card border-primary shadow-sm" : "bg-card border-border hover:shadow-sm")}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={cn("h-5 w-5 rounded flex items-center justify-center text-white bg-gradient-to-br shrink-0", GRAD[a.color] ?? GRAD.blue)}><Icon className="h-3 w-3" /></span>
                  <span className="font-medium text-xs truncate">{a.name}</span>
                </div>
                <div className="font-bold text-sm text-primary tabular">{formatMoney(bal.toNumber())}</div>
                <button onClick={(ev) => { ev.stopPropagation(); setConfirmDelete("acc:" + a.id); }} className="hidden group-hover/acct:flex absolute top-1 right-1 h-5 w-5 rounded bg-destructive/10 text-destructive items-center justify-center"><Trash2 className="h-3 w-3" /></button>
              </button>
            );
          })}
          <button onClick={() => setShowAcc(true)} className="shrink-0 rounded-lg border border-dashed border-border px-3 py-2 min-w-[80px] flex flex-col items-center justify-center gap-1 hover:border-primary/40 hover:bg-accent/50 transition-colors">
            <span className="h-6 w-6 rounded bg-primary/10 text-primary flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></span>
            <span className="text-[10px] font-medium text-muted-foreground">Add</span>
          </button>
        </div>
      </CardContent>
    </Card>

    {/* Transactions — inside Card like Requests */}
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Transactions</CardTitle>
        <div className="flex flex-wrap gap-2 mt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search" value={q} onChange={(e)=>setQ(e.target.value)} className="pl-7 h-8 text-xs max-w-[160px]" />
          </div>
          <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 text-xs"><option value="all">All Categories</option><option value="none">None</option>{cats?.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <div className="flex items-center rounded-full border bg-card p-0.5">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full" onClick={() => shift(-1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="min-w-[90px] text-center text-[11px] font-semibold capitalize">{monthLabel}</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full" onClick={() => shift(1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
          {ym.y !== now0.getFullYear() || ym.m !== now0.getMonth() ? (
            <Button variant="outline" size="sm" className="h-8 rounded-full text-[11px] px-2.5 gap-1" onClick={() => setYm({ y: now0.getFullYear(), m: now0.getMonth() })}><CalendarClock className="h-3 w-3" />Now</Button>
          ) : null}
          {(q || catFilter !== "all") && (
            <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => { setQ(""); setCatFilter("all"); }}>Clear</Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-1.5">{[0,1,2,3].map(i => <div key={i} className="skeleton h-[52px]" />)}</div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center animate-fade-up">
            <span className="rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 p-3 text-white shadow-lg"><Wallet className="h-6 w-6" /></span>
            <div className="font-medium">No transactions this month</div>
            <div className="text-sm text-muted-foreground">Track spending, income & transfers between ledgers</div>
            <div className="flex gap-2">
              <Button onClick={() => openAdd("expense")} variant="outline" size="sm"><ArrowDownCircle className="h-4 w-4 mr-1" />Expense</Button>
              <Button onClick={() => openAdd("income")} size="sm" className="bg-emerald-600 hover:bg-emerald-700"><ArrowUpCircle className="h-4 w-4 mr-1" />Income</Button>
              <Button onClick={() => openAdd("transfer")} variant="secondary" size="sm"><ArrowLeftRight className="h-4 w-4 mr-1" />Transfer</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, items]) => {
              const d = new Date(date);
              const label = isNaN(d.getTime()) ? date : d.toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "short", year: "numeric" });
              const dayTotal = items.reduce((s,e) => {
                const a = Number(e.amount ?? 0);
                return s + (e.direction === "expense" ? -a : e.direction === "income" ? a : 0);
              }, 0);
              return (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground tabular">{items.length} • {dayTotal >= 0 ? "+" : ""}{formatMoney(Math.abs(dayTotal))}</span>
                  </div>
                  <div className="space-y-1">
                    {items.map((e) => {
                      const cat = catById(e.category_id);
                      const acc = accById(e.account_id);
                      const toAcc = accById(e.transfer_to_account_id);
                      const isTransfer = e.direction === "transfer";
                      const Icon = isTransfer ? ArrowLeftRight : catIcon(cat?.name ?? e.title);
                      const iconGrad = isTransfer ? "from-blue-500 to-cyan-500" : e.direction === "income" ? "from-emerald-500 to-teal-500" : cat ? GRAD[cat.color] ?? GRAD.slate : "from-rose-500 to-pink-500";
                      const amtColor = isTransfer ? "text-blue-600" : e.direction === "income" ? "text-emerald-600" : "text-rose-600";
                      return (
                        <SwipeRow key={e.id} actions={[{ label: "Delete", kind: "destructive", onClick: () => setConfirmDelete(e.id) }]}>
                        <div className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-muted/30 active:bg-muted/50 transition-colors group cursor-pointer" onClick={() => openEdit(e)}>
                          <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0 bg-gradient-to-br shadow-sm", iconGrad)}><Icon className="h-3.5 w-3.5" /></span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-[13px] truncate">{e.title}</span>
                              {isTransfer && <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">transfer</Badge>}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              {isTransfer ? (
                                <span className="truncate">{acc?.name ?? "?"} → {toAcc?.name ?? "?"}</span>
                              ) : (
                                <span className="truncate">{cat?.name ?? ""}{cat && acc?.name ? " · " : ""}{acc?.name ?? ""}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn("font-semibold text-[13px] tabular", amtColor)}>{e.direction === "expense" ? "−" : e.direction === "income" ? "+" : ""}{formatMoney(Number(e.amount ?? 0))}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{new Date(e.entry_date).toLocaleDateString(dateLocale(lang), { day:"2-digit", month:"short" })}</div>
                          </div>
                          <button onClick={(ev) => { ev.stopPropagation(); setConfirmDelete(e.id); }} className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        </SwipeRow>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Add/Edit Dialog */}
    <Dialog open={showAdd} onOpenChange={setShowAdd}>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Transaction" : "New Transaction"}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4">
        <div className="flex rounded-full bg-muted p-1">
          {(["expense","income","transfer"] as const).map((k) => (
            <button key={k} onClick={()=>{setTxType(k); setFormErr(null);}} className={cn("flex-1 rounded-full py-2 text-xs font-medium capitalize flex items-center justify-center gap-1.5 transition-all", txType===k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground")}>
              {k==="expense" ? <ArrowDownCircle className="h-4 w-4" /> : k==="income" ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}{k}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="e.g. Groceries, Salary" className="mt-1.5" /></div>
          <div><Label>Amount (IDR)</Label><Input value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})} inputMode="decimal" placeholder="50000" className="mt-1.5 text-lg font-semibold tabular" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category</Label><Select value={form.category_id} onChange={(e)=>setForm({...form,category_id:e.target.value})} className="mt-1.5"><option value="">None</option>{cats?.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
            <div><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e)=>setForm({...form,entry_date:e.target.value})} className="mt-1.5" /></div>
          </div>
          {txType === "transfer" ? (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From</Label><Select value={form.account_id} onChange={(e)=>setForm({...form,account_id:e.target.value})} className="mt-1.5"><option value="">Select</option>{accounts?.map((a)=><option key={a.id} value={a.id}>{a.name} — {formatMoney((balances.get(a.id) ?? new Decimal(0)).toNumber())}</option>)}</Select></div>
              <div><Label>To</Label><Select value={form.to_account_id} onChange={(e)=>setForm({...form,to_account_id:e.target.value})} className="mt-1.5"><option value="">Select</option>{accounts?.map((a)=><option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
            </div>
          ) : (
            <div><Label>Ledger</Label><Select value={form.account_id} onChange={(e)=>setForm({...form,account_id:e.target.value})} className="mt-1.5"><option value="">Select ledger</option>{accounts?.map((a)=><option key={a.id} value={a.id}>{a.name} — {formatMoney((balances.get(a.id) ?? new Decimal(0)).toNumber())}</option>)}</Select></div>
          )}
          <div><Label>Note</Label><Textarea value={form.body} onChange={(e)=>setForm({...form,body:e.target.value})} placeholder="Optional note" rows={2} className="mt-1.5" /></div>
        </div>
        {formErr && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">{formErr}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={()=>setShowAdd(false)}>Cancel</Button>
          <Button onClick={()=>saveTx.mutate()} disabled={saveTx.isPending}>{editing ? "Save" : "Add"} {txType}</Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* New Account Dialog */}
    <Dialog open={showAcc} onOpenChange={setShowAcc}>
      <DialogHeader>
        <DialogTitle>New Ledger Account</DialogTitle>
        <DialogDescription>Track BCA, Cash, Savings… each with its own balance</DialogDescription>
      </DialogHeader>
      <DialogContent className="space-y-4">
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={newAcc.name} onChange={(e)=>setNewAcc({...newAcc,name:e.target.value})} placeholder="BCA / Cash / Savings" className="mt-1.5" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Icon</Label><Select value={newAcc.icon} onChange={(e)=>setNewAcc({...newAcc,icon:e.target.value})} className="mt-1.5"><option value="wallet">Wallet</option><option value="bca">BCA</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="investment">Invest</option></Select></div>
            <div><Label>Color</Label><Select value={newAcc.color} onChange={(e)=>setNewAcc({...newAcc,color:e.target.value})} className="mt-1.5"><option value="blue">Blue</option><option value="violet">Violet</option><option value="emerald">Green</option><option value="amber">Amber</option><option value="rose">Rose</option><option value="slate">Slate</option></Select></div>
          </div>
          <div><Label>Initial Balance (IDR)</Label><Input value={newAcc.initial_balance} onChange={(e)=>setNewAcc({...newAcc,initial_balance:e.target.value})} inputMode="decimal" placeholder="0" className="mt-1.5" /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={()=>setShowAcc(false)}>Cancel</Button>
          <Button onClick={()=>createAcc.mutate()} disabled={createAcc.isPending}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Delete Confirmation Dialog */}
    <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
      <DialogHeader>
        <DialogTitle>{confirmDelete?.startsWith("acc:") ? "Delete Account" : "Delete Transaction"}</DialogTitle>
        <DialogDescription>{confirmDelete?.startsWith("acc:") ? "Remove this ledger permanently?" : "This cannot be undone."}</DialogDescription>
      </DialogHeader>
      <DialogContent>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => {
            if (!confirmDelete) return;
            if (confirmDelete.startsWith("acc:")) { delAcc.mutate(confirmDelete.slice(4)); }
            else { delTx.mutate(confirmDelete); }
          }} disabled={delTx.isPending || delAcc.isPending}>{(delTx.isPending || delAcc.isPending) ? "Deleting…" : "Delete"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div></PullToRefresh>;
}