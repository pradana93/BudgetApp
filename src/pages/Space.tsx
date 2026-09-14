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
import { Search, ChevronLeft, ChevronRight, Plus, Trash2, PencilLine, Wallet, ArrowLeftRight, Utensils, Film, Car, Receipt, ShoppingCart, PiggyBank, DollarSign, CreditCard, Landmark, Sparkles, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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
      if (needle && !`${e.title} ${e.body} ${catById(e.category_id)?.name ?? ""}`.toLowerCase().includes(needle)) return false;
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
  const openAdd = (type: "expense"|"income"|"transfer" = "expense") => { setTxType(type); setForm({ title: "", body: "", amount: "", category_id: cats?.[0]?.id ?? "", account_id: accounts?.[0]?.id ?? "", to_account_id: accounts?.[1]?.id ?? "", entry_date: new Date().toISOString().slice(0,10) }); setEditing(null); setShowAdd(true); };
  const openEdit = (e: Entry) => { setEditing(e); setTxType(e.direction as "expense"|"income"|"transfer"); setForm({ title: e.title, body: e.body, amount: e.amount != null ? String(e.amount) : "", category_id: e.category_id ?? "", account_id: e.account_id ?? "", to_account_id: e.transfer_to_account_id ?? "", entry_date: e.entry_date.slice(0,10) }); setShowAdd(true); };

  const saveTx = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no user");
      if (!form.title.trim() || !isValidMoney(form.amount) || Number(form.amount) <= 0) throw new Error("Title and amount required");
      if (txType !== "transfer" && !form.account_id) throw new Error("Select account");
      if (txType === "transfer" && (!form.account_id || !form.to_account_id || form.account_id === form.to_account_id)) throw new Error("Select two different accounts");
      const payload: Record<string, unknown> = { user_id: profile.id, title: form.title.trim().slice(0,120), body: form.body.slice(0,4000), amount: Number(form.amount), category_id: form.category_id || null, direction: txType, entry_date: form.entry_date, account_id: form.account_id || null, transfer_to_account_id: txType === "transfer" ? form.to_account_id : null };
      if (editing) { const { error } = await supabase.from("personal_notes").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("personal_notes").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { setShowAdd(false); setEditing(null); qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }); toast({ title: "Saved" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const delTx = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("personal_notes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }); toast({ title: "Deleted" }); },
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

  const totalBalance = [...balances.values()].reduce((a,b) => a.add(b), new Decimal(0));

  return (
    <div className="space-y-5 max-w-5xl">
      {/* BudgetApp Premium Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white p-5 md:p-6 shadow-lg overflow-hidden relative">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-white/15 p-3 backdrop-blur"><Wallet className="h-6 w-6" /></span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">Personal Ledger <Badge variant="secondary" className="bg-white text-violet-700 text-[10px]">PREMIUM</Badge></h1>
                <p className="text-sm text-white/85">Private by RLS — Income, Expense & Transfer across your Accounts</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setShowAcc(true)} className="bg-white text-violet-700 hover:bg-white/90"><Plus className="h-4 w-4 mr-1" /> Account</Button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/10 backdrop-blur p-3 border border-white/15">
              <div className="text-xs text-white/70 flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5" /> EXPENSE</div>
              <div className="font-bold text-lg tabular mt-0.5">{formatMoney(sums.exp.toNumber())}</div>
              <div className="text-[11px] text-white/60">{filtered.filter(e=>e.direction==="expense").length} records</div>
            </div>
            <div className="rounded-xl bg-white/10 backdrop-blur p-3 border border-white/15">
              <div className="text-xs text-white/70 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> INCOME</div>
              <div className="font-bold text-lg tabular mt-0.5">{formatMoney(sums.inc.toNumber())}</div>
              <div className="text-[11px] text-white/60">{filtered.filter(e=>e.direction==="income").length} records</div>
            </div>
            <div className="rounded-xl bg-white text-violet-700 p-3 shadow-md">
              <div className="text-xs text-violet-600/70 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> BALANCE</div>
              <div className="font-bold text-lg tabular mt-0.5">{formatMoney(sums.bal.toNumber())}</div>
              <div className="text-[11px] text-violet-600/60">{accounts?.length ?? 0} ledgers • {formatMoney(totalBalance.toNumber())} total</div>
            </div>
          </div>
        </div>
      </div>

      {/* Month nav + filters — all working */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border bg-card p-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[140px] text-center text-sm font-semibold capitalize px-2">{monthLabel}</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-9 text-sm rounded-full bg-card"><option value="all">All Categories</option><option value="none">None</option>{cats?.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <div className="relative flex-1 min-w-[160px] max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search title or note" value={q} onChange={(e)=>setQ(e.target.value)} className="pl-9 h-9 rounded-full bg-card" />
        </div>
      </div>

      {/* Accounts — BudgetApp premium cards, all working */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Ledger Accounts</h3>
          <span className="text-xs text-muted-foreground">{accounts?.length ?? 0} • Tap to filter • + to create</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          <button onClick={() => setAccFilter("all")} className={cn("shrink-0 rounded-2xl p-4 text-left min-w-[160px] border-2 transition-all", accFilter==="all" ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white border-violet-500 shadow-lg scale-[1.02]" : "bg-card border-border hover:border-primary/30")}>
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 text-white flex items-center justify-center mb-2"><Wallet className="h-4 w-4" /></div>
            <div className="font-bold text-sm">All Ledgers</div><div className="tabular font-bold">{formatMoney(totalBalance.toNumber())}</div><div className="text-xs opacity-70">{filtered.length} this month</div>
          </button>
          {accounts?.map((a) => {
            const Icon = ICONS[a.icon] ?? Wallet;
            const bal = balances.get(a.id) ?? new Decimal(0);
            const active = accFilter===a.id;
            return (
              <button key={a.id} onClick={() => setAccFilter(active ? "all" : a.id)} className={cn("shrink-0 rounded-2xl p-4 text-left min-w-[160px] border-2 transition-all", active ? "bg-card border-violet-500 shadow-lg scale-[1.02]" : "bg-card border-border hover:shadow-md")}>
                <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center mb-2 text-white bg-gradient-to-br", GRAD[a.color] ?? GRAD.blue)}><Icon className="h-4 w-4" /></div>
                <div className="font-bold text-sm truncate">{a.name}</div>
                <div className="tabular font-bold text-primary">{formatMoney(bal.toNumber())}</div>
                <div className="text-xs text-muted-foreground">Init {formatMoney(Number(a.initial_balance))}</div>
              </button>
            );
          })}
          <button onClick={() => setShowAcc(true)} className="shrink-0 rounded-2xl border-2 border-dashed border-border p-4 min-w-[140px] flex flex-col items-center justify-center gap-1.5 hover:border-primary/40 hover:bg-accent/50 transition-colors">
            <span className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Plus className="h-5 w-5" /></span>
            <span className="text-sm font-medium">New Ledger</span><span className="text-xs text-muted-foreground">BCA • Cash • Savings</span>
          </button>
        </div>
      </div>

      {/* Transactions — grouped, BudgetApp cards, all buttons work */}
      <div className="space-y-3">
        {grouped.length===0 ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center"><Wallet className="h-6 w-6 text-primary" /></div>
            <div className="font-semibold">No transactions this month</div>
            <div className="text-sm text-muted-foreground">Add Income, Expense or Transfer to your ledgers</div>
            <div className="flex justify-center gap-2 pt-2">
              <Button onClick={()=>openAdd("expense")} variant="outline"><ArrowDownCircle className="h-4 w-4 mr-1.5" /> Expense</Button>
              <Button onClick={()=>openAdd("income")} className="bg-emerald-600 hover:bg-emerald-700"><ArrowUpCircle className="h-4 w-4 mr-1.5" /> Income</Button>
              <Button onClick={()=>openAdd("transfer")} variant="secondary"><ArrowLeftRight className="h-4 w-4 mr-1.5" /> Transfer</Button>
            </div>
          </CardContent></Card>
        ) : grouped.map(([date, items]) => {
          const d = new Date(date);
          const label = isNaN(d.getTime()) ? date : d.toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "short", year: "numeric" });
          return (
            <div key={date} className="space-y-2">
              <div className="sticky top-0 z-10 bg-background/80 backdrop-blur px-1 py-1.5 flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
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
                    <Card key={e.id} className="overflow-hidden hover:shadow-md transition-shadow group">
                      <CardContent className="p-3 flex items-center gap-3">
                        <span className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br shadow-sm", iconGrad)}><Icon className="h-5 w-5" /></span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate flex items-center gap-1.5">{cat?.name ?? e.title} {isTransfer && <Badge variant="secondary" className="text-[10px] h-5">Transfer</Badge>}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs mt-0.5">
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
                        <div className="text-right shrink-0">
                          <div className={cn("font-bold tabular", amountColor)}>{e.direction === "expense" ? "-" : e.direction === "income" ? "+" : ""}{formatMoney(Number(e.amount ?? 0))}</div>
                          <div className="text-[11px] text-muted-foreground">{new Date(e.entry_date).toLocaleDateString(dateLocale(lang), { day:"2-digit", month:"short" })}</div>
                        </div>
                        <div className="hidden sm:flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={()=>openEdit(e)}><PencilLine className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={()=>delTx.mutate(e.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="sm:hidden flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={()=>openEdit(e)}><PencilLine className="h-3.5 w-3.5" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* FAB — works */}
      <button onClick={()=>openAdd("expense")} className="fixed bottom-20 right-4 z-20 h-14 w-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform">
        <Plus className="h-7 w-7" />
      </button>

      {/* Add/Edit Dialog — all fields work */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          <DialogDescription>BudgetApp Premium — Income, Expense or Transfer between your ledgers</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="flex rounded-full bg-muted p-1 mb-2">
            {(["expense","income","transfer"] as const).map((k) => (
              <button key={k} onClick={()=>setTxType(k)} className={cn("flex-1 rounded-full py-2 text-sm font-medium capitalize flex items-center justify-center gap-1.5", txType===k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground")}>
                {k==="expense" ? <ArrowDownCircle className="h-4 w-4" /> : k==="income" ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}{k}
              </button>
            ))}
          </div>
          <div className="grid gap-3">
            <div><Label>Title</Label><Input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="e.g. Groceries, Salary, BCA → Cash" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Select value={form.category_id} onChange={(e)=>setForm({...form,category_id:e.target.value})}><option value="">None</option>{cats?.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
              <div><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e)=>setForm({...form,entry_date:e.target.value})} /></div>
            </div>
            <div><Label>Amount (IDR)</Label><Input value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})} inputMode="decimal" placeholder="50000" className="tabular" /></div>
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
    </div>
  );
}
