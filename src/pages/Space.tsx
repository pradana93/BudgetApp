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
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { formatMoney, isValidMoney } from "@/lib/money";
import { dateLocale } from "@/lib/datetime";
import { Lock, Plus, Trash2, ShieldCheck, ChevronLeft, ChevronRight, Search, Check, X, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  title: string;
  body: string;
  amount: number | null;
  category_id: string | null;
  direction: "income" | "expense";
  entry_date: string;
  created_at: string;
  updated_at: string;
};
type PCat = { id: string; name: string; color: string; monthly_budget: number | null };

const COLORS: { id: string; dot: string; chip: string }[] = [
  { id: "blue", dot: "bg-blue-500", chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { id: "violet", dot: "bg-violet-500", chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { id: "emerald", dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { id: "amber", dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { id: "rose", dot: "bg-rose-500", chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
];
const colorOf = (c: string) => COLORS.find((x) => x.id === c) ?? COLORS[0];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => isoDay(new Date());

type Draft = { title: string; body: string; amount: string; category_id: string; direction: "income" | "expense"; entry_date: string };
const emptyDraft = (): Draft => ({ title: "", body: "", amount: "", category_id: "", direction: "expense", entry_date: today() });

export default function Space() {
  const { profile } = useSession();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();

  const now0 = new Date();
  const [ym, setYm] = React.useState<{ y: number; m: number }>({ y: now0.getFullYear(), m: now0.getMonth() });
  const [allMonths, setAllMonths] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [catFilter, setCatFilter] = React.useState("all");
  const [confirmDel, setConfirmDel] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Entry | null>(null);

  const [addRow, setAddRow] = React.useState<Draft>(emptyDraft());

  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft());
  const [formErr, setFormErr] = React.useState<string | null>(null);

  const [newCatName, setNewCatName] = React.useState("");
  const [newCatBudget, setNewCatBudget] = React.useState("");
  const [newCatColor, setNewCatColor] = React.useState("blue");
  const [confirmCatDel, setConfirmCatDel] = React.useState<string | null>(null);
  const [catsOpen, setCatsOpen] = React.useState(false);

  const { data: entries } = useQuery({
    queryKey: ["personal-entries", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_notes")
        .select("id,title,body,amount,category_id,direction,entry_date,created_at,updated_at")
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
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

  React.useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`personal-ledger-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_notes" }, () => qc.invalidateQueries({ queryKey: ["personal-entries", profile.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_categories" }, () => qc.invalidateQueries({ queryKey: ["personal-cats", profile.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, profile]);

  const invalidateEntries = () => qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] });
  const invalidateCats = () => qc.invalidateQueries({ queryKey: ["personal-cats", profile?.id] });

  const amountOf = (d: Draft) => d.amount.trim();
  const validate = (d: Draft): string | null => {
    if (!d.title.trim() || !amountOf(d)) return t("ledger.fRequired");
    if (!isValidMoney(amountOf(d)) || Number(amountOf(d)) <= 0) return t("v.amountGt");
    return null;
  };

  const saveEntry = useMutation({
    mutationFn: async ({ d, id }: { d: Draft; id: string | null }) => {
      if (!profile) throw new Error("no user");
      const err = validate(d);
      if (err) throw new Error(err);
      const payload = {
        user_id: profile.id,
        title: d.title.trim().slice(0, 120),
        body: d.body.slice(0, 4000),
        amount: Number(amountOf(d)),
        category_id: d.category_id || null,
        direction: d.direction,
        entry_date: d.entry_date || today(),
      };
      if (id) {
        const { error } = await supabase.from("personal_notes").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("personal_notes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_r, { d, id }) => {
      invalidateEntries();
      if (id) {
        setOpen(false);
        toast({ title: t("ledger.entrySaved") });
      } else {
        const carryDate = d.entry_date;
        const carryCat = d.category_id;
        setAddRow({ ...emptyDraft(), entry_date: carryDate, category_id: carryCat });
        toast({ title: t("ledger.entrySaved") });
      }
    },
    onError: (e: Error) => {
      setFormErr(e.message);
      toast({ title: t("space.failed"), description: e.message, variant: "destructive" });
    },
  });

  const delEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personal_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setConfirmDel(null); invalidateEntries(); toast({ title: t("ledger.entryDeleted") }); },
    onError: (e: Error) => toast({ title: t("space.failed"), description: e.message, variant: "destructive" }),
  });

  const addCat = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no user");
      const name = newCatName.trim().slice(0, 60);
      if (!name) return;
      const budget = newCatBudget.trim();
      if (budget && !(isValidMoney(budget) && Number(budget) >= 0)) throw new Error(t("v.invalidAmount"));
      const { error } = await supabase.from("personal_categories").insert({ user_id: profile.id, name, color: newCatColor, monthly_budget: budget ? Number(budget) : null });
      if (error) throw error;
    },
    onSuccess: () => { setNewCatName(""); setNewCatBudget(""); invalidateCats(); toast({ title: t("space.catAdded") }); },
    onError: (e: Error) => toast({ title: t("space.failed"), description: e.message, variant: "destructive" }),
  });

  const delCat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personal_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setConfirmCatDel(null); invalidateCats(); invalidateEntries(); toast({ title: t("space.catDeleted") }); },
    onError: (e: Error) => toast({ title: t("space.failed"), description: e.message, variant: "destructive" }),
  });

  const catById = (id: string | null) => cats?.find((c) => c.id === id);

  // Running balance across ALL entries, then view a slice.
  const withBalance = React.useMemo(() => {
    let run = new Decimal(0);
    return (entries ?? []).map((e) => {
      const amt = new Decimal(e.amount ?? 0);
      run = e.direction === "income" ? run.add(amt) : run.sub(amt);
      return { ...e, balance: run };
    });
  }, [entries]);

  const monthKey = (iso: string) => (iso ?? "").slice(0, 7);
  const curKey = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;

  const visible = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return withBalance.filter((e) => {
      if (!allMonths && monthKey(e.entry_date) !== curKey) return false;
      if (catFilter !== "all" && (e.category_id ?? "none") !== catFilter) return false;
      if (needle && !`${e.title} ${e.body}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [withBalance, allMonths, curKey, catFilter, q]);

  const openingBalance = React.useMemo(() => {
    if (allMonths) return new Decimal(0);
    let run = new Decimal(0);
    for (const e of withBalance) {
      if (monthKey(e.entry_date) >= curKey) break;
      const amt = new Decimal(e.amount ?? 0);
      run = e.direction === "income" ? run.add(amt) : run.sub(amt);
    }
    return run;
  }, [withBalance, allMonths, curKey]);

  const sums = React.useMemo(() => {
    let inp = new Decimal(0);
    let outp = new Decimal(0);
    for (const e of visible) {
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "income") inp = inp.add(amt);
      else outp = outp.add(amt);
    }
    return { inp, outp, net: inp.sub(outp), close: openingBalance.add(inp).sub(outp) };
  }, [visible, openingBalance]);

  const catSpent = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries ?? []) {
      if (e.direction !== "expense" || e.amount == null) continue;
      if (!allMonths && monthKey(e.entry_date) !== curKey) continue;
      const key = e.category_id ?? "__none";
      map.set(key, (map.get(key) ?? 0) + Number(e.amount));
    }
    return map;
  }, [entries, allMonths, curKey]);

  const shift = (d: number) => {
    setAllMonths(false);
    setYm((v) => {
      const dt = new Date(v.y, v.m + d, 1);
      return { y: dt.getFullYear(), m: dt.getMonth() };
    });
  };
  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString(dateLocale(lang), { month: "long", year: "numeric" });
  const totalPlan = (cats ?? []).reduce((s, c) => s + (c.monthly_budget ? Number(c.monthly_budget) : 0), 0);

  const openEditDialog = (e: Entry) => {
    setEditing(e);
    setFormErr(null);
    setDraft({
      title: e.title,
      body: e.body,
      amount: e.amount != null ? String(e.amount) : "",
      category_id: e.category_id ?? "",
      direction: e.direction,
      entry_date: e.entry_date ?? today(),
    });
    setOpen(true);
  };

  const rowClass = "grid grid-cols-2 md:grid-cols-[110px_1fr_150px_120px_120px_140px_64px] gap-2 items-center";

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 text-white p-6 shadow-lg overflow-hidden relative">
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="rounded-2xl bg-white/15 p-3 backdrop-blur shrink-0"><Lock className="h-7 w-7" /></span>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold tracking-tight">{t("ledger.title")}</h1>
            <p className="text-sm text-white/85 mt-0.5">{t("ledger.sub")}</p>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-white/75">
              <ShieldCheck className="h-3.5 w-3.5" /> Row-level security: private from every other account.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-right">
            <div className="text-xs text-white/70">{t("ledger.income")}</div>
            <div className="text-xs text-white/70">{t("ledger.expense")}</div>
            <div className="text-xs text-white/70">{t("ledger.balance")}</div>
            <div className="font-bold tabular">{formatMoney(sums.inp.toNumber())}</div>
            <div className="font-bold tabular">{formatMoney(sums.outp.toNumber())}</div>
            <div className="font-bold tabular">{formatMoney(sums.close.toNumber())}</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => shift(-1)} aria-label={t("ledger.prevMonth")}><ChevronLeft className="h-4 w-4" /></Button>
          <span className={cn("min-w-[150px] text-center text-sm font-semibold capitalize", allMonths && "text-muted-foreground")}>{allMonths ? t("ledger.allMonths") : monthLabel}</span>
          <Button variant="outline" size="sm" onClick={() => shift(1)} aria-label={t("ledger.nextMonth")}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Button variant={allMonths ? "default" : "ghost"} size="sm" onClick={() => setAllMonths((v) => !v)}>{t("ledger.allMonths")}</Button>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-auto h-9 text-sm" aria-label={t("ledger.cat")}>
          <option value="all">{t("ledger.allCats")}</option>
          <option value="none">{t("ledger.uncategorized")}</option>
          {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <div className="relative flex-1 min-w-[140px] max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("space.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button size="sm" onClick={() => document.getElementById("ledger-add-first")?.focus()}><Plus className="h-4 w-4 mr-1.5" />{t("ledger.newEntry")}</Button>
      </div>

      {/* Ledger */}
      <Card>
        <CardContent className="pt-4">
          <div className={cn(rowClass, "hidden md:grid pb-2 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground")}>
            <span>{t("ledger.date")}</span><span>{t("ledger.desc")}</span><span>{t("ledger.cat")}</span>
            <span className="text-right">{t("ledger.income")}</span><span className="text-right">{t("ledger.expense")}</span>
            <span className="text-right">{t("ledger.balance")}</span><span />
          </div>

          {visible.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("ledger.empty")}</div>
          )}

          {visible.map((e) => {
            const cat = catById(e.category_id);
            const day = new Date(e.entry_date);
            return (
              <div key={e.id} className={cn(rowClass, "py-2 border-b last:border-0 text-sm")}>
                <span className="tabular text-muted-foreground whitespace-nowrap">{Number.isNaN(day.getTime()) ? e.entry_date : day.toLocaleDateString(dateLocale(lang), { day: "2-digit", month: "short" })}</span>
                <span className="min-w-0">
                  <span className="font-medium truncate block">{e.title}</span>
                  {e.body && <span className="text-xs text-muted-foreground line-clamp-1">{e.body}</span>}
                </span>
                <span className="min-w-0">
                  {cat
                    ? <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium max-w-full", colorOf(cat.color).chip)}><span className={cn("h-1.5 w-1.5 rounded-full shrink-0", colorOf(cat.color).dot)} /><span className="truncate">{cat.name}</span></span>
                    : <span className="text-xs text-muted-foreground">{t("ledger.uncategorized")}</span>}
                </span>
                <span className="tabular text-right font-semibold text-emerald-600 dark:text-emerald-400">{e.direction === "income" ? formatMoney(Number(e.amount ?? 0)) : ""}</span>
                <span className="tabular text-right font-semibold text-rose-600 dark:text-rose-400">{e.direction === "expense" ? formatMoney(Number(e.amount ?? 0)) : ""}</span>
                <span className="tabular text-right font-bold">{formatMoney(e.balance.toNumber())}</span>
                <span className="flex items-center justify-end gap-1">
                  {confirmDel === e.id ? (
                    <>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setConfirmDel(null)} aria-label={t("space.cancel")}><X className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="destructive" className="h-6 w-6 p-0" onClick={() => delEntry.mutate(e.id)} aria-label={t("space.delete")}><Check className="h-3.5 w-3.5" /></Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEditDialog(e)} aria-label={t("profile.editTitle")}><PencilLine className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDel(e.id)} aria-label={t("space.delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                </span>
              </div>
            );
          })}

          {/* Add row */}
          <div className={cn(rowClass, "pt-3")}>
            <Input id="ledger-add-first" type="date" value={addRow.entry_date} onChange={(ev) => setAddRow({ ...addRow, entry_date: ev.target.value })} className="h-9" aria-label={t("ledger.date")} />
            <Input placeholder={t("ledger.desc")} value={addRow.title} onChange={(ev) => setAddRow({ ...addRow, title: ev.target.value })} maxLength={120} className="h-9" />
            <Select value={addRow.category_id} onChange={(ev) => setAddRow({ ...addRow, category_id: ev.target.value })} className="h-9 text-sm" aria-label={t("ledger.cat")}>
              <option value="">{t("ledger.uncategorized")}</option>
              {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input placeholder="0" value={addRow.direction === "income" ? addRow.amount : ""} onChange={(ev) => setAddRow({ ...addRow, amount: ev.target.value, direction: "income" })} inputMode="decimal" className="h-9 tabular text-right" aria-label={t("ledger.income")} />
            <Input placeholder="0" value={addRow.direction === "expense" ? addRow.amount : ""} onChange={(ev) => setAddRow({ ...addRow, amount: ev.target.value, direction: "expense" })} inputMode="decimal" className="h-9 tabular text-right" aria-label={t("ledger.expense")} />
            <Button onClick={() => saveEntry.mutate({ d: addRow, id: null })} disabled={saveEntry.isPending || !addRow.title.trim() || !amountOf(addRow)} className="h-9 justify-self-end whitespace-nowrap"><Plus className="h-4 w-4 mr-1" />{t("ledger.addEntry")}</Button>
            <span />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("ledger.inOut")} • {t("ledger.fRequired")}</p>
        </CardContent>
      </Card>

      {/* Categories & budgets */}
      <Card>
        <CardContent className="pt-5">
          <button type="button" onClick={() => setCatsOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
            <span className="text-left">
              <span className="text-sm font-semibold block">{t("space.budgets")}</span>
              <span className="text-xs text-muted-foreground">{t("space.budgetSub")}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-sm tabular text-muted-foreground whitespace-nowrap">{cats?.length ?? 0} {t("space.cats").toLowerCase()}</span>
              <span className={cn("inline-block transition-transform", catsOpen && "rotate-180")}>
                <ChevronRight className="h-4 w-4 rotate-90" />
              </span>
            </span>
          </button>

          {catsOpen && (
            <div className="mt-4 space-y-2">
              {cats?.map((c) => {
                const spent = catSpent.get(c.id) ?? 0;
                const budget = c.monthly_budget ? Number(c.monthly_budget) : 0;
                const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
                const over = budget > 0 && spent > budget;
                return (
                  <div key={c.id} className="grid grid-cols-2 sm:grid-cols-[1fr_140px_120px_1fr_36px] gap-2 items-center border-t pt-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={cn("h-3 w-3 rounded-full shrink-0", colorOf(c.color).dot)} />
                      <span className="font-medium truncate">{c.name}</span>
                    </span>
                    <span className="tabular text-muted-foreground">{c.monthly_budget != null ? formatMoney(Number(c.monthly_budget)) : t("space.noBudgetSet")}</span>
                    <span className={cn("tabular", over && "text-destructive font-semibold")}>{formatMoney(spent)}</span>
                    <span className="col-span-2 sm:col-span-1 h-2 rounded-full bg-muted overflow-hidden"><span className={cn("block h-2 rounded-full transition-all", over ? "bg-destructive" : "bg-gradient-to-r from-fuchsia-500 to-indigo-500")} style={{ width: `${pct}%` }} /></span>
                    {confirmCatDel === c.id ? (
                      <span className="col-span-2 sm:col-span-2 flex items-center gap-1 text-xs">
                        <span className="truncate">{t("space.deleteCatConfirm")}</span>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setConfirmCatDel(null)} aria-label={t("space.cancel")}><X className="h-3 w-3" /></Button>
                        <Button size="sm" variant="destructive" className="h-6 w-6 p-0" onClick={() => delCat.mutate(c.id)} aria-label={t("space.deleteCat")}><Check className="h-3 w-3" /></Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmCatDel(c.id)} aria-label={t("space.deleteCat")}><Trash2 className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                );
              })}

              <div className="grid grid-cols-2 sm:grid-cols-[1fr_140px_120px_1fr_36px] gap-2 items-center border-t pt-3">
                <span className="flex items-center gap-2 min-w-0">
                  <button type="button" onClick={() => setNewCatColor(COLORS[(COLORS.findIndex((x) => x.id === newCatColor) + 1) % COLORS.length].id)} aria-label={t("space.catColor")}
                    className={cn("h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-primary/40 ring-offset-2", colorOf(newCatColor).dot)} />
                  <Input placeholder={t("space.addCategory")} value={newCatName} onChange={(e) => setNewCatName(e.target.value)} maxLength={60}
                    onKeyDown={(e) => { if (e.key === "Enter" && newCatName.trim()) { e.preventDefault(); addCat.mutate(); } }}
                    className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0" />
                </span>
                <Input placeholder={t("space.noBudgetSet")} value={newCatBudget} onChange={(e) => setNewCatBudget(e.target.value)} inputMode="decimal" maxLength={14} className="h-8 text-sm" aria-label={t("space.colBudget")} />
                <span />
                <div className="col-span-2 sm:col-span-1 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => addCat.mutate()} disabled={addCat.isPending || !newCatName.trim()}>
                    <Plus className="h-3.5 w-3.5 mr-1" />{t("admin.add")}
                  </Button>
                </div>
                <span />
              </div>
              {totalPlan > 0 && <p className="text-xs text-muted-foreground">{t("space.total")}: {formatMoney(totalPlan)} / {t("ledger.outMonth")}: {formatMoney([...catSpent.values()].reduce((a, b) => a + b, 0))}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 p-2.5 text-white shadow-md shrink-0"><Lock className="h-5 w-5" /></span>
            <div className="min-w-0">
              <DialogTitle>{editing ? t("ledger.editEntry") : t("ledger.newEntry")}</DialogTitle>
              <DialogDescription>{t("ledger.sub")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4">
            <div>
              <Label>{t("ledger.desc")}</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} autoFocus />
            </div>
            <div>
              <Label>{t("space.fBody")}</Label>
              <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={3} maxLength={4000} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label>{t("ledger.date")}</Label>
                <Input type="date" value={draft.entry_date} onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })} />
              </div>
              <div>
                <Label>{t("space.fAmount")}</Label>
                <Input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} inputMode="decimal" placeholder="0" />
              </div>
              <div>
                <Label>{t("ledger.inOut")}</Label>
                <Select value={draft.direction} onChange={(e) => setDraft({ ...draft, direction: e.target.value as "income" | "expense" })}>
                  <option value="expense">{t("ledger.expense")}</option>
                  <option value="income">{t("ledger.income")}</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("ledger.cat")}</Label>
              <Select value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}>
                <option value="">{t("ledger.uncategorized")}</option>
                {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            {formErr && <div className="text-sm text-destructive">{formErr}</div>}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="flex-1 sm:flex-none">{t("common.cancel")}</Button>
          <Button onClick={() => editing && saveEntry.mutate({ d: draft, id: editing.id })} disabled={saveEntry.isPending} className="flex-1 sm:flex-none sm:min-w-[140px]">{saveEntry.isPending ? t("common.loading") : t("space.save")}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
