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
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent } from "@/components/ui/dialog";
import { formatMoney, isValidMoney } from "@/lib/money";
import { dateLocale } from "@/lib/datetime";
import { Search, ChevronLeft, ChevronRight, Plus, Trash2, PencilLine, Wallet, ArrowLeftRight, Utensils, Film, Car, Receipt, ShoppingCart, PiggyBank, DollarSign, CreditCard, Landmark, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Entry = { id: string; title: string; body: string; amount: number | null; category_id: string | null; direction: "income" | "expense" | "transfer"; entry_date: string; created_at: string; account_id: string | null; transfer_to_account_id: string | null };
type PCat = { id: string; name: string; color: string; monthly_budget: number | null };
type Account = { id: string; name: string; icon: string; color: string; initial_balance: number; created_at: string };

const ICONS: Record<string, React.ElementType> = { wallet: Wallet, cash: DollarSign, bca: CreditCard, bank: Landmark, entertainment: Film, food: Utensils, car: Car, bills: Receipt, shopping: ShoppingCart, investment: PiggyBank, transfer: ArrowLeftRight };
const COLORS: Record<string, string> = { blue: "from-blue-500 to-blue-600", violet: "from-violet-500 to-violet-600", emerald: "from-emerald-500 to-emerald-600", amber: "from-amber-500 to-orange-500", rose: "from-rose-500 to-pink-500", slate: "from-slate-600 to-slate-700", cyan: "from-cyan-500 to-teal-500", orange: "from-orange-500 to-red-500" };
const DOT: Record<string, string> = { blue: "bg-blue-500", violet: "bg-violet-500", emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", slate: "bg-slate-500", cyan: "bg-cyan-500", orange: "bg-orange-500" };


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
    const ch = supabase.channel(`premium-ledger-${profile.id}`)
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

  // account balances: initial + sum
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
      } else if (e.direction === "transfer" && e.account_id) {
        map.set(e.account_id, (map.get(e.account_id) ?? new Decimal(0)).sub(amt));
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
    // balance = sum all months up to current
    let bal = new Decimal(0);
    for (const a of accounts ?? []) bal = bal.add(new Decimal(a.initial_balance ?? 0));
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) > curKey) continue;
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "income") bal = bal.add(amt);
      else if (e.direction === "expense") bal = bal.sub(amt);
      // transfer net 0 overall, so ignore for total balance (moves between accounts)
    }
    return { exp, inc, bal };
  }, [filtered, entries, accounts, curKey]);

  // grouped by date
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
  const openEdit = (e: Entry) => {
    setEditing(e);
    setTxType(e.direction as "expense"|"income"|"transfer");
    setForm({ title: e.title, body: e.body, amount: e.amount != null ? String(e.amount) : "", category_id: e.category_id ?? "", account_id: e.account_id ?? "", to_account_id: e.transfer_to_account_id ?? "", entry_date: e.entry_date.slice(0,10) });
    setShowAdd(true);
  };

  const saveTx = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no user");
      if (!form.title.trim() || !isValidMoney(form.amount) || Number(form.amount) <= 0) throw new Error("Invalid");
      if (txType !== "transfer" && !form.account_id) throw new Error("Select account");
      if (txType === "transfer" && (!form.account_id || !form.to_account_id || form.account_id === form.to_account_id)) throw new Error("Select two different accounts");
      const payload: Record<string, unknown> = {
        user_id: profile.id,
        title: form.title.trim().slice(0,120),
        body: form.body.slice(0,4000),
        amount: Number(form.amount),
        category_id: form.category_id || null,
        direction: txType,
        entry_date: form.entry_date,
        account_id: form.account_id || null,
        transfer_to_account_id: txType === "transfer" ? form.to_account_id : null,
      };
      if (editing) {
        const { error } = await supabase.from("personal_notes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("personal_notes").insert(payload);
        if (error) throw error;
      }
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
    <div className="min-h-[80vh] -mx-4 -mt-4 md:-mx-6 md:-mt-6">
      {/* MyMoney dark premium header */}
      <div className="bg-[#3a3a3a] text-[#f5f5dc] sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xl font-bold italic tracking-wide" style={{ fontFamily: "cursive" }}>MyMoney</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAcc(true)} className="rounded-full bg-white/10 p-2"><Wallet className="h-4 w-4" /></button>
            <div className="relative"><Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 opacity-60" /><Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search" className="h-8 pl-7 bg-white/10 border-white/20 text-white placeholder:text-white/50 w-28 focus:w-40 transition-all" /></div>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-2 text-center">
          <button onClick={() => shift(-1)} className="p-2 rounded-full hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
          <span className="font-semibold">{monthLabel}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => shift(1)} className="p-2 rounded-full hover:bg-white/10"><ChevronRight className="h-5 w-5" /></button>
            <button className="p-2 rounded-full hover:bg-white/10"><SlidersHorizontal className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-3 text-center py-3 border-t border-white/10 text-sm">
          <div><div className="text-xs opacity-70">EXPENSE</div><div className="font-bold text-[#ff8a80] tabular">Rp{formatMoney(sums.exp.toNumber()).replace("Rp","")}</div></div>
          <div><div className="text-xs opacity-70">INCOME</div><div className="font-bold text-[#a5d6a7] tabular">Rp{formatMoney(sums.inc.toNumber()).replace("Rp","")}</div></div>
          <div><div className="text-xs opacity-70">BALANCE</div><div className="font-bold tabular">Rp{formatMoney(sums.bal.toNumber()).replace("Rp","")}</div></div>
        </div>
      </div>

      {/* Accounts horizontal */}
      <div className="bg-[#2f2f2f] px-3 py-3 border-b border-white/10">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button onClick={() => setAccFilter("all")} className={cn("shrink-0 rounded-xl px-4 py-3 text-left min-w-[110px]", accFilter==="all" ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white" : "bg-white/10 text-white/80")}>
            <div className="text-xs opacity-70">All</div><div className="font-bold text-sm tabular">{formatMoney(totalBalance.toNumber())}</div><div className="text-[11px] opacity-60">{accounts?.length ?? 0} accounts</div>
          </button>
          {accounts?.map((a) => {
            const Icon = ICONS[a.icon] ?? Wallet;
            const bal = balances.get(a.id) ?? new Decimal(0);
            return (
              <button key={a.id} onClick={() => setAccFilter(accFilter===a.id ? "all" : a.id)} className={cn("shrink-0 rounded-xl px-4 py-3 text-left min-w-[130px] border", accFilter===a.id ? "bg-white text-slate-800 border-violet-500" : "bg-[#3a3a3a] text-white border-white/10")}>
                <div className={cn("h-6 w-6 rounded-full flex items-center justify-center mb-1 bg-gradient-to-br text-white text-xs", COLORS[a.color] ?? COLORS.blue)}><Icon className="h-3.5 w-3.5" /></div>
                <div className="font-semibold text-sm truncate">{a.name}</div><div className="tabular text-xs">{formatMoney(bal.toNumber())}</div>
              </button>
            );
          })}
          <button onClick={() => setShowAcc(true)} className="shrink-0 rounded-xl border-2 border-dashed border-white/20 px-4 py-3 min-w-[110px] text-white/70 flex flex-col items-center justify-center gap-1"><Plus className="h-5 w-5" /><span className="text-xs">New</span></button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#e8e8e8] px-3 py-2 flex gap-2 overflow-x-auto">
        <Select value={catFilter} onChange={(e)=>setCatFilter(e.target.value)} className="h-8 text-xs bg-white"><option value="all">All Categories</option><option value="none">None</option>{cats?.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <span className="text-xs text-muted-foreground py-1.5 whitespace-nowrap">{filtered.length} records</span>
      </div>

      {/* Grouped list */}
      <div className="bg-[#d6d6d6] min-h-[50vh] pb-24">
        {grouped.length===0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No records this month — tap + to add Income/Expense/Transfer</div>
        ) : grouped.map(([date, items]) => {
          const d = new Date(date);
          const label = isNaN(d.getTime()) ? date : d.toLocaleDateString(dateLocale(lang), { month: "short", day: "numeric", weekday: "long" });
          return (
            <div key={date}>
              <div className="sticky top-0 bg-[#c9c9c9] px-3 py-1.5 text-xs font-semibold text-slate-700 border-b border-slate-400/20">{label}</div>
              {items.map((e) => {
                const cat = catById(e.category_id);
                const acc = accById(e.account_id);
                const toAcc = accById(e.transfer_to_account_id);
                const isTransfer = e.direction === "transfer";
                const Icon = isTransfer ? ArrowLeftRight : catIcon(cat?.name ?? e.title);
                const iconBg = isTransfer ? "bg-blue-600" : e.direction === "income" ? "bg-emerald-600" : cat ? DOT[cat.color] ?? "bg-slate-500" : "bg-rose-500";
                const amountColor = isTransfer ? "text-blue-600" : e.direction === "income" ? "text-emerald-600" : "text-[#c75c5c]";
                const amountPrefix = isTransfer ? "" : e.direction === "income" ? "" : "-";
                return (
                  <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 bg-[#d6d6d6] border-b border-white/40 hover:bg-white/40 group">
                    <span className={cn("h-9 w-9 rounded-full flex items-center justify-center text-white shrink-0", iconBg)}><Icon className="h-5 w-5" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-800 truncate">{cat?.name ?? e.title}</div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        {isTransfer ? (
                          <>
                            <span className="inline-flex items-center gap-1 rounded bg-white/60 px-1.5 py-0.5 border"><Wallet className="h-3 w-3" />{acc?.name ?? "?"}</span>
                            <ArrowLeftRight className="h-3 w-3" />
                            <span className="inline-flex items-center gap-1 rounded bg-white/60 px-1.5 py-0.5 border"><Wallet className="h-3 w-3" />{toAcc?.name ?? "?"}</span>
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 rounded bg-white/60 px-1.5 py-0.5 border"><CreditCard className="h-3 w-3" />{acc?.name ?? "Cash"}{e.body ? ` “ ${e.body.slice(0,16)} ”` : ""}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={cn("font-bold tabular text-sm shrink-0", amountColor)}>{amountPrefix}Rp{formatMoney(Number(e.amount ?? 0)).replace("Rp","")}</span>
                    <span className="hidden group-hover:flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={()=>openEdit(e)}><PencilLine className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600" onClick={()=>delTx.mutate(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* FAB */}
      <button onClick={()=>openAdd("expense")} className="fixed bottom-20 right-4 z-20 h-14 w-14 rounded-full bg-[#8a8a7a] text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform">
        <Plus className="h-7 w-7" />
      </button>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          <DialogDescription>Income / Expense / Transfer — choose account like MyMoney</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="flex rounded-full bg-muted p-1 mb-3">
            {(["expense","income","transfer"] as const).map((k) => (
              <button key={k} onClick={()=>setTxType(k)} className={cn("flex-1 rounded-full py-1.5 text-sm font-medium capitalize", txType===k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground")}>{k}</button>
            ))}
          </div>
          <div className="grid gap-3">
            <div><Label>Title / Category</Label><Input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="e.g. Entertainment, Food" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Select value={form.category_id} onChange={(e)=>setForm({...form,category_id:e.target.value})}><option value="">None</option>{cats?.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
              <div><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e)=>setForm({...form,entry_date:e.target.value})} /></div>
            </div>
            <div><Label>Amount (IDR)</Label><Input value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})} inputMode="decimal" placeholder="50000" /></div>
            {txType === "transfer" ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>From Account</Label><Select value={form.account_id} onChange={(e)=>setForm({...form,account_id:e.target.value})}><option value="">Select</option>{accounts?.map((a)=><option key={a.id} value={a.id}>{a.name} — {formatMoney((balances.get(a.id) ?? new Decimal(0)).toNumber())}</option>)}</Select></div>
                <div><Label>To Account</Label><Select value={form.to_account_id} onChange={(e)=>setForm({...form,to_account_id:e.target.value})}><option value="">Select</option>{accounts?.map((a)=><option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
              </div>
            ) : (
              <div><Label>Account</Label><Select value={form.account_id} onChange={(e)=>setForm({...form,account_id:e.target.value})}><option value="">Select account</option>{accounts?.map((a)=><option key={a.id} value={a.id}>{a.name} — {formatMoney((balances.get(a.id) ?? new Decimal(0)).toNumber())}</option>)}</Select></div>
            )}
            <div><Label>Note</Label><Textarea value={form.body} onChange={(e)=>setForm({...form,body:e.target.value})} placeholder="e.g. ganti Flazz trip" rows={2} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={()=>setShowAdd(false)}>Cancel</Button>
            <Button onClick={()=>saveTx.mutate()} disabled={saveTx.isPending}>{editing ? "Save" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Account Dialog */}
      <Dialog open={showAcc} onOpenChange={setShowAcc}>
        <DialogHeader><DialogTitle>New Ledger Account</DialogTitle><DialogDescription>BCA, Cash, Savings… each has its own balance</DialogDescription></DialogHeader>
        <DialogContent>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input value={newAcc.name} onChange={(e)=>setNewAcc({...newAcc,name:e.target.value})} placeholder="BCA / Cash / Entertainment" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Icon</Label><Select value={newAcc.icon} onChange={(e)=>setNewAcc({...newAcc,icon:e.target.value})}><option value="wallet">Wallet</option><option value="bca">BCA</option><option value="cash">Cash</option><option value="bank">Bank</option></Select></div>
              <div><Label>Color</Label><Select value={newAcc.color} onChange={(e)=>setNewAcc({...newAcc,color:e.target.value})}><option value="blue">Blue</option><option value="violet">Violet</option><option value="emerald">Emerald</option><option value="amber">Amber</option><option value="rose">Rose</option><option value="slate">Slate</option></Select></div>
            </div>
            <div><Label>Initial Balance (IDR)</Label><Input value={newAcc.initial_balance} onChange={(e)=>setNewAcc({...newAcc,initial_balance:e.target.value})} inputMode="decimal" placeholder="0" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={()=>setShowAcc(false)}>Cancel</Button>
            <Button onClick={()=>createAcc.mutate()} disabled={createAcc.isPending}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
