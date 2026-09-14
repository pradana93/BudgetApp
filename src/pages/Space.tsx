import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { useLang } from "@/i18n/LanguageContext";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatMoney, isValidMoney } from "@/lib/money";
import { dateLocale } from "@/lib/datetime";
import { Search, ChevronLeft, ChevronRight, Plus, Trash2, PencilLine, Wallet, ArrowLeftRight, Utensils, Film, Car, Receipt, ShoppingCart, PiggyBank, DollarSign, CreditCard, Landmark, Sparkles, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SwipeRow } from "@/components/SwipeRow";

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

  if (isLoading) return (
    <div className="space-y-5 max-w-5xl animate-fade-up">
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 p-5 md:p-6 h-[180px]" />
      <div className="flex gap-2">{[1,2,3].map(i => <div key={i} className="skeleton h-9 w-24 rounded-full" />)}</div>
      <div className="flex gap-3 overflow-x-auto pb-2">{[1,2,3].map(i => <div key={i} className="skeleton h-[120px] w-[160px] rounded-2xl shrink-0" />)}</div>
      <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-[72px] rounded-xl" />)}</div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5 max-w-5xl">
      {/* BudgetApp Premium Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white p-5 md:p-6 shadow-lg overflow-hidden relative">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-white/15 p-3 backdrop-blur"><Wallet className="h-6 w-6" /></span>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Personal Ledger <Badge variant="secondary" className="bg-white text-violet-700 text-[10px] align-middle ml-1">PREMIUM</Badge></h1>
                <p className="text-xs sm:text-sm text-white/85 line-clamp-2">Private by RLS — Income, Expense & Transfer across your Accounts</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setShowAcc(true)} className="bg-white text-violet-700 hover:bg-white/90"><Plus className="h-4 w-4 mr-1" /> Account</Button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl bg-white/10 backdrop-blur p-3 border border-white/15">
              <div className="text-xs text-white/70 flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5" /> EXPENSE</div>
              <div className="font-bold text-sm sm:text-lg tabular mt-0.5 truncate">{formatMoney(monthTotals.exp.toNumber())}</div>
              <div className="text-[10px] sm:text-[11px] text-white/60">{monthTotals.expN} rec</div>
            </div>
            <div className="rounded-xl bg-white/10 backdrop-blur p-3 border border-white/15">
              <div className="text-xs text-white/70 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> INCOME</div>
              <div className="font-bold text-sm sm:text-lg tabular mt-0.5 truncate">{formatMoney(monthTotals.inc.toNumber())}</div>
              <div className="text-[10px] sm:text-[11px] text-white/60">{monthTotals.incN} rec</div>
            </div>
            <div className="rounded-xl bg-white text-violet-700 p-3 shadow-md">
              <div className="text-xs text-violet-600/70 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> BALANCE</div>
              <div className="font-bold text-sm sm:text-lg tabular mt-0.5 truncate">{formatMoney(sums.bal.toNumber())}</div>
              <div className="text-[10px] sm:text-[11px] text-violet-600/60 truncate">{accounts?.length ?? 0} ledgers</div>
            </div>
          </div>
        </div>
      </div>

      {/* Month nav + filters — all working */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border bg-card p-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[100px] sm:min-w-[140px] text-center text-xs sm:text-sm font-semibold capitalize px-1 sm:px-2">{monthLabel}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {ym.y !== now0.getFullYear() || ym.m !== now0.getMonth() ? (
            <Button variant="outline" size="sm" className="h-7 sm:h-8 rounded-full text-[10px] sm:text-xs gap-1" onClick={() => setYm({ y: now0.getFullYear(), m: now0.getMonth() })}><CalendarClock className="h-3 w-3" />Today</Button>
          ) : null}
          <div className="relative flex-1 min-w-0 ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search" value={q} onChange={(e)=>setQ(e.target.value)} className="pl-8 h-8 sm:h-9 text-sm rounded-full bg-card" />
          </div>
        </div>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 sm:h-9 text-xs sm:text-sm rounded-full bg-card w-full sm:w-auto sm:max-w-[200px]"><option value="all">All Categories</option><option value="none">None</option>{cats?.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </div>

      {/* Accounts — BudgetApp premium cards, all working */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Ledger Accounts</h3>
          <span className="text-xs text-muted-foreground">{accounts?.length ?? 0} • Tap to filter • + to create</span>
        </div>
        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scroll-smooth">
          <button onClick={() => setAccFilter("all")} className={cn("shrink-0 snap-start rounded-2xl p-3 sm:p-4 text-left min-w-[130px] sm:min-w-[160px] border-2 transition-all", accFilter==="all" ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white border-violet-500 shadow-lg sm:scale-[1.02]" : "bg-card border-border hover:border-primary/30")}>
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 text-white flex items-center justify-center mb-2"><Wallet className="h-4 w-4" /></div>
            <div className="font-bold text-xs sm:text-sm">All Ledgers</div><div className="tabular font-bold text-xs sm:text-sm truncate">{formatMoney(totalBalance.toNumber())}</div><div className="text-[10px] sm:text-xs opacity-70">{filtered.length} this mo.</div>
          </button>
          {accounts?.map((a) => {
            const Icon = ICONS[a.icon] ?? Wallet;
            const bal = balances.get(a.id) ?? new Decimal(0);
            const active = accFilter===a.id;
            return (
              <button key={a.id} onClick={() => setAccFilter(active ? "all" : a.id)} className={cn("shrink-0 snap-start rounded-2xl p-3 sm:p-4 text-left min-w-[130px] sm:min-w-[160px] border-2 transition-all relative group/acct", active ? "bg-card border-violet-500 shadow-lg sm:scale-[1.02]" : "bg-card border-border hover:shadow-md")}>
                <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center mb-2 text-white bg-gradient-to-br", GRAD[a.color] ?? GRAD.blue)}><Icon className="h-4 w-4" /></div>
                <div className="font-bold text-xs sm:text-sm truncate">{a.name}</div>
                <div className="tabular font-bold text-xs sm:text-sm text-primary truncate">{formatMoney(bal.toNumber())}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Init {formatMoney(Number(a.initial_balance))}</div>
                <button onClick={(ev) => { ev.stopPropagation(); setConfirmDelete("acc:" + a.id); }} className="hidden group-hover/acct:flex absolute top-2 right-2 h-5 w-5 rounded-md bg-destructive/10 text-destructive items-center justify-center hover:bg-destructive/20 transition-colors"><Trash2 className="h-3 w-3" /></button>
              </button>
            );
          })}
          <button onClick={() => setShowAcc(true)} className="shrink-0 snap-start rounded-2xl border-2 border-dashed border-border p-3 sm:p-4 min-w-[110px] sm:min-w-[140px] flex flex-col items-center justify-center gap-1 hover:border-primary/40 hover:bg-accent/50 transition-colors">
            <span className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Plus className="h-5 w-5" /></span>
            <span className="text-xs sm:text-sm font-medium">New Ledger</span><span className="text-[10px] sm:text-xs text-muted-foreground">BCA • Cash • Savings</span>
          </button>
        </div>
      </div>

      {/* Transactions — grouped, BudgetApp cards, all buttons work */}
      <div className="space-y-3">
        {grouped.length===0 ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center space-y-3 animate-fade-up">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white shadow-lg"><Wallet className="h-6 w-6" /></div>
            <div className="font-semibold">No transactions this month</div>
            <div className="text-sm text-muted-foreground max-w-xs mx-auto">Track your daily spending, income, and transfers between ledgers.</div>
            <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
              <Button onClick={()=>openAdd("expense")} variant="outline" size="sm"><ArrowDownCircle className="h-3.5 w-3.5 mr-1" /> Expense</Button>
              <Button onClick={()=>openAdd("income")} size="sm" className="bg-emerald-600 hover:bg-emerald-700"><ArrowUpCircle className="h-3.5 w-3.5 mr-1" /> Income</Button>
              <Button onClick={()=>openAdd("transfer")} variant="secondary" size="sm"><ArrowLeftRight className="h-3.5 w-3.5 mr-1" /> Transfer</Button>
            </div>
            <div className="pt-3 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Expenses reduce balance</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Income increases it</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Transfers move between ledgers</span>
            </div>
          </CardContent></Card>
        ) : grouped.map(([date, items]) => {
          const d = new Date(date);
          const label = isNaN(d.getTime()) ? date : d.toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "short", year: "numeric" });
          return (
            <div key={date} className="space-y-2">
              <div className="sticky top-[52px] sm:top-0 z-10 bg-background/90 backdrop-blur-sm px-1 py-1.5 flex items-center gap-2">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</span>
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">{items.length} • {formatMoney(items.reduce((s,e)=>s+Number(e.amount??0),0))}</span>
              </div>
              <div className="grid gap-2">
                {items.map((e) => {
                  const cat = catById(e.category_id);
                  const acc = accById(e.account_id);
                  const toAcc = accById(e.transfer_to_account_id);
                  const isTransfer = e.direction === "transfer";
                  const Icon = isTransfer ? ArrowLeftRight : catIcon(cat?.name ?? e.title);
                  const iconGrad = isTransfer ? "from-blue-500 to-cyan-500" : e.direction === "income" ? "from-emerald-500 to-teal-500" : cat ? GRAD[cat.color] ?? GRAD.slate : "from-rose-500 to-pink-500";
                  const amountColor = isTransfer ? "text-blue-600" : e.direction === "income" ? "text-emerald-600" : "text-rose-600";
                  return (
                    <SwipeRow key={e.id} actions={[{ label: "Delete", kind: "destructive", onClick: () => setConfirmDelete(e.id) }]}>
                    <Card className="overflow-hidden hover:shadow-md transition-shadow group">
                      <CardContent className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
                        <span className={cn("h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br shadow-sm", iconGrad)}><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-xs sm:text-sm truncate">{e.title}{isTransfer && <Badge variant="secondary" className="text-[9px] sm:text-[10px] h-4 sm:h-5 ml-1 align-middle">Transfer</Badge>}</div>
                          {cat && <div className="text-[10px] sm:text-[11px] text-muted-foreground truncate mt-0.5">{cat.name}</div>}
                          <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs mt-0.5 truncate">
                            {isTransfer ? (
                              <>
                                <Badge variant="outline" className="h-5 gap-1 bg-muted/50"><Wallet className="h-3 w-3" />{acc?.name ?? "?"}</Badge>
                                <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                                <Badge variant="outline" className="h-5 gap-1 bg-muted/50"><Wallet className="h-3 w-3" />{toAcc?.name ?? "?"}</Badge>
                              </>
                            ) : (
                              <Badge variant="outline" className="h-5 gap-1 bg-muted/50"><CreditCard className="h-3 w-3" />{acc?.name ?? "No ledger"}</Badge>
                            )}
                            {e.body && <span className="truncate text-muted-foreground">“{e.body}”</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 pl-1">
                          <div className={cn("font-bold text-xs sm:text-sm tabular", amountColor)}>{e.direction === "expense" ? "-" : e.direction === "income" ? "+" : ""}{formatMoney(Number(e.amount ?? 0))}</div>
                          <div className="text-[9px] sm:text-[11px] text-muted-foreground">{new Date(e.entry_date).toLocaleDateString(dateLocale(lang), { day:"2-digit", month:"short" })}</div>
                        </div>
                        <div className="hidden sm:flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={()=>openEdit(e)}><PencilLine className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={()=>delTx.mutate(e.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="sm:hidden flex gap-1.5">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={()=>openEdit(e)}><PencilLine className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={()=>setConfirmDelete(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                    </SwipeRow>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* FAB — works */}
      <button onClick={()=>openAdd("expense")} className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-20 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl flex items-center justify-center active:scale-90 transition-transform" aria-label="Add transaction">
        <Plus className="h-5 w-5 sm:h-7 sm:w-7" />
      </button>

      {/* Add/Edit Dialog — all fields work */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          <DialogDescription>BudgetApp Premium — Income, Expense or Transfer between your ledgers</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="flex rounded-full bg-muted p-0.5 sm:p-1 mb-2">
            {(["expense","income","transfer"] as const).map((k) => (
              <button key={k} onClick={()=>setTxType(k)} className={cn("flex-1 rounded-full py-2 text-sm font-medium capitalize flex items-center justify-center gap-1.5", txType===k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground")}>
                {k==="expense" ? <ArrowDownCircle className="h-4 w-4" /> : k==="income" ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}{k}
              </button>
            ))}
          </div>
          <div className="grid gap-3">
            <div><Label>Title</Label><Input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="e.g. Groceries, Salary, BCA → Cash" className="h-10 sm:h-auto" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Select value={form.category_id} onChange={(e)=>setForm({...form,category_id:e.target.value})}><option value="">None</option>{cats?.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
              <div><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e)=>setForm({...form,entry_date:e.target.value})} /></div>
            </div>
            <div><Label>Amount (IDR)</Label><Input value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})} inputMode="decimal" placeholder="50000" className="tabular h-10 sm:h-auto text-lg font-semibold" /></div>
            {txType === "transfer" ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>From Ledger</Label><Select value={form.account_id} onChange={(e)=>setForm({...form,account_id:e.target.value})}><option value="">Select</option>{accounts?.map((a)=><option key={a.id} value={a.id}>{a.name} — {formatMoney((balances.get(a.id) ?? new Decimal(0)).toNumber())}</option>)}</Select></div>
                <div><Label>To Ledger</Label><Select value={form.to_account_id} onChange={(e)=>setForm({...form,to_account_id:e.target.value})}><option value="">Select</option>{accounts?.map((a)=><option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
              </div>
            ) : (
              <div><Label>Ledger Account</Label><Select value={form.account_id} onChange={(e)=>setForm({...form,account_id:e.target.value})}><option value="">Select ledger</option>{accounts?.map((a)=><option key={a.id} value={a.id}>{a.name} — {formatMoney((balances.get(a.id) ?? new Decimal(0)).toNumber())}</option>)}</Select></div>
            )}
            <div><Label>Note</Label><Textarea value={form.body} onChange={(e)=>setForm({...form,body:e.target.value})} placeholder="e.g. ganti Flazz trip" rows={2} /></div>
          </div>
          {formErr && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">{formErr}</div>}
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={()=>setShowAdd(false)}>Cancel</Button>
            <Button onClick={()=>saveTx.mutate()} disabled={saveTx.isPending}>{editing ? "Save" : "Add"} {txType}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Account Dialog — works */}
      <Dialog open={showAcc} onOpenChange={setShowAcc}>
        <DialogHeader><DialogTitle>New Ledger Account</DialogTitle><DialogDescription>Create BCA, Cash, Savings… each tracks its own balance</DialogDescription></DialogHeader>
        <DialogContent>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input value={newAcc.name} onChange={(e)=>setNewAcc({...newAcc,name:e.target.value})} placeholder="BCA / Cash / Entertainment" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Icon</Label><Select value={newAcc.icon} onChange={(e)=>setNewAcc({...newAcc,icon:e.target.value})}><option value="wallet">Wallet</option><option value="bca">BCA</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="investment">Investment</option></Select></div>
              <div><Label>Color</Label><Select value={newAcc.color} onChange={(e)=>setNewAcc({...newAcc,color:e.target.value})}><option value="blue">Blue</option><option value="violet">Violet</option><option value="emerald">Emerald</option><option value="amber">Amber</option><option value="rose">Rose</option><option value="slate">Slate</option></Select></div>
            </div>
            <div><Label>Initial Balance (IDR)</Label><Input value={newAcc.initial_balance} onChange={(e)=>setNewAcc({...newAcc,initial_balance:e.target.value})} inputMode="decimal" placeholder="0" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={()=>setShowAcc(false)}>Cancel</Button>
            <Button onClick={()=>createAcc.mutate()} disabled={createAcc.isPending}>Create Ledger</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogHeader>
          <DialogTitle>{confirmDelete?.startsWith("acc:") ? "Delete Account" : "Delete Transaction"}</DialogTitle>
          <DialogDescription>{confirmDelete?.startsWith("acc:") ? "This will permanently remove this ledger account and cannot be undone." : "This action cannot be undone. The transaction will be permanently removed from your ledger."}</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (!confirmDelete) return;
              if (confirmDelete.startsWith("acc:")) { delAcc.mutate(confirmDelete.slice(4)); }
              else { delTx.mutate(confirmDelete); }
            }} disabled={delTx.isPending || delAcc.isPending}>{(delTx.isPending || delAcc.isPending) ? "Deleting…" : "Delete"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
