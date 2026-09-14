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
import { Download, Tag, Repeat, BarChart3, X, Bookmark } from "lucide-react";
import { PullToRefresh } from "@/components/PullToRefresh";

type Entry = { id: string; title: string; body: string; amount: number | null; category_id: string | null; direction: "income" | "expense" | "transfer"; entry_date: string; created_at: string; account_id: string | null; transfer_to_account_id: string | null };
type PCat = { id: string; name: string; color: string; monthly_budget: number | null };
type Account = { id: string; name: string; icon: string; color: string; initial_balance: number; created_at: string };
type Tag = { id: string; name: string; color: string };
type Recurring = { id: string; title: string; body: string; amount: number; category_id: string | null; direction: "income" | "expense"; account_id: string | null; frequency: string; next_date: string; last_generated: string | null; active: boolean };
type Template = { title: string; amount: string; category_id: string; direction: "expense" | "income"; account_id: string };

const ICONS: Record<string, React.ElementType> = { wallet: Wallet, cash: DollarSign, bca: CreditCard, bank: Landmark, entertainment: Film, food: Utensils, car: Car, bills: Receipt, shopping: ShoppingCart, investment: PiggyBank, transfer: ArrowLeftRight };
const GRAD: Record<string, string> = { blue: "from-blue-500 to-indigo-500", violet: "from-violet-500 to-purple-500", emerald: "from-emerald-500 to-teal-500", amber: "from-amber-500 to-orange-500", rose: "from-rose-500 to-pink-500", slate: "from-slate-500 to-slate-600", cyan: "from-cyan-500 to-teal-500", orange: "from-orange-500 to-red-500" };
const TAG_COLORS = ["blue","violet","emerald","amber","rose","slate","cyan","orange"];
const FREQUENCIES = [{ value: "weekly", label: "Weekly" }, { value: "biweekly", label: "Biweekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }];

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
  const [tagFilter, setTagFilter] = React.useState<string>("all");
  const [showTagMgr, setShowTagMgr] = React.useState(false);
  const [newTagName, setNewTagName] = React.useState("");
  const [newTagColor, setNewTagColor] = React.useState("blue");
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [showRecurring, setShowRecurring] = React.useState(false);
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [recForm, setRecForm] = React.useState({ title: "", amount: "", category_id: "", direction: "expense" as "expense" | "income", account_id: "", frequency: "monthly", next_date: new Date().toISOString().slice(0,10) });
  const [templates, setTemplates] = React.useState<Template[]>(() => { try { return JSON.parse(localStorage.getItem("space-templates") ?? "[]"); } catch { return []; } });

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

  const { data: tags } = useQuery({
    queryKey: ["personal-tags", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_tags").select("id,name,color").order("name");
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
    enabled: !!profile,
  });
  const { data: noteTags } = useQuery({
    queryKey: ["personal-note-tags", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_note_tags").select("note_id,tag_id");
      if (error) throw error;
      return (data ?? []) as { note_id: string; tag_id: string }[];
    },
    enabled: !!profile,
  });
  const { data: recurring } = useQuery({
    queryKey: ["personal-recurring", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_recurring").select("*").order("next_date");
      if (error) throw error;
      return (data ?? []) as Recurring[];
    },
    enabled: !!profile,
  });

  React.useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`ledger-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_notes" }, () => qc.invalidateQueries({ queryKey: ["personal-entries", profile.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_accounts" }, () => qc.invalidateQueries({ queryKey: ["personal-accounts", profile.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_categories" }, () => qc.invalidateQueries({ queryKey: ["personal-cats", profile.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_recurring" }, () => qc.invalidateQueries({ queryKey: ["personal-recurring", profile.id] }))
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
      if (tagFilter !== "all") {
        const noteTagIds = (noteTags ?? []).filter(nt => nt.note_id === e.id).map(nt => nt.tag_id);
        if (!noteTagIds.includes(tagFilter)) return false;
      }
      return true;
    });
  }, [entries, curKey, catFilter, accFilter, q, cats, tagFilter, noteTags]);

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

  const tagsForNote = React.useCallback((noteId: string) => {
    const tagIds = (noteTags ?? []).filter(nt => nt.note_id === noteId).map(nt => nt.tag_id);
    return (tags ?? []).filter(t => tagIds.includes(t.id));
  }, [noteTags, tags]);

  const lastMonth = React.useMemo(() => {
    const dt = new Date(ym.y, ym.m - 1, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
    let exp = new Decimal(0), inc = new Decimal(0);
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) !== key) continue;
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "expense") exp = exp.add(amt);
      else if (e.direction === "income") inc = inc.add(amt);
    }
    return { exp, inc };
  }, [entries, ym]);

  const heatmap = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) !== curKey) continue;
      if (e.direction !== "expense") continue;
      const day = e.entry_date.slice(8,10);
      map.set(day, (map.get(day) ?? 0) + Number(e.amount ?? 0));
    }
    return map;
  }, [entries, curKey]);

  const maxHeat = React.useMemo(() => {
    let max = 0;
    for (const v of heatmap.values()) if (v > max) max = v;
    return max;
  }, [heatmap]);

  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthReport = React.useMemo(() => {
    const catTotals = new Map<string, number>();
    let total = 0;
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) !== curKey || e.direction !== "expense") continue;
      const a = Number(e.amount ?? 0);
      total += a;
      const catObj = (cats ?? []).find(c => c.id === e.category_id);
      const name = catObj?.name ?? "Other";
      catTotals.set(name, (catTotals.get(name) ?? 0) + a);
    }
    const sorted = [...catTotals.entries()].sort((a,b) => b[1] - a[1]).slice(0,3);
    const avgPerDay = total / Math.max(1, daysInMonth);
    return { total, topCats: sorted, avgPerDay, txCount: entries?.filter(e => e.entry_date.slice(0,7) === curKey && e.direction === "expense").length ?? 0 };
  }, [entries, curKey, cats, ym, daysInMonth]);

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
  const openAdd = (type: "expense"|"income"|"transfer" = "expense") => { setTxType(type); setForm({ title: "", body: "", amount: "", category_id: cats?.[0]?.id ?? "", account_id: accounts?.[0]?.id ?? "", to_account_id: accounts?.[1]?.id ?? "", entry_date: new Date().toISOString().slice(0,10) }); setEditing(null); setFormErr(null); setSelectedTagIds([]); setShowAdd(true); };
  const openEdit = (e: Entry) => { setEditing(e); setTxType(e.direction as "expense"|"income"|"transfer"); setForm({ title: e.title, body: e.body, amount: e.amount != null ? String(e.amount) : "", category_id: e.category_id ?? "", account_id: e.account_id ?? "", to_account_id: e.transfer_to_account_id ?? "", entry_date: e.entry_date.slice(0,10) }); setFormErr(null); setSelectedTagIds((noteTags ?? []).filter(nt => nt.note_id === e.id).map(nt => nt.tag_id)); setShowAdd(true); };

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
      if (editing) { const { error } = await supabase.from("personal_notes").update(payload).eq("id", editing.id); if (error) throw error; return { id: editing.id }; }
      else { const { data, error } = await supabase.from("personal_notes").insert(payload).select("id").single(); if (error) throw error; return data; }
    },
    onSuccess: (data) => { if (selectedTagIds.length > 0 && data) { saveNoteTags.mutate({ noteId: (data as { id: string }).id, tagIds: selectedTagIds }); } setShowAdd(false); setEditing(null); setFormErr(null); setSelectedTagIds([]); setSelectedTagIds([]); qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }); try { navigator.vibrate?.(15); } catch { /* vibrate not supported */ } toast({ title: "Saved" }); },
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

  const saveTag = useMutation({
    mutationFn: async () => {
      if (!profile || !newTagName.trim()) throw new Error("Name required");
      const { error } = await supabase.from("personal_tags").insert({ user_id: profile.id, name: newTagName.trim().slice(0,30), color: newTagColor });
      if (error) throw error;
    },
    onSuccess: () => { setNewTagName(""); setNewTagColor("blue"); qc.invalidateQueries({ queryKey: ["personal-tags", profile?.id] }); toast({ title: "Tag created" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const delTag = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("personal_tags").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personal-tags", profile?.id] }); toast({ title: "Tag deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const saveNoteTags = useMutation({
    mutationFn: async ({ noteId, tagIds }: { noteId: string; tagIds: string[] }) => {
      await supabase.from("personal_note_tags").delete().eq("note_id", noteId);
      if (tagIds.length > 0) {
        const rows = tagIds.map(tid => ({ note_id: noteId, tag_id: tid }));
        const { error } = await supabase.from("personal_note_tags").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personal-note-tags", profile?.id] }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const saveRecurring = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no user");
      if (!recForm.title.trim() || !isValidMoney(recForm.amount)) throw new Error("Title and amount required");
      const { error } = await supabase.from("personal_recurring").insert({
        user_id: profile.id, title: recForm.title.trim().slice(0,120), amount: Number(recForm.amount),
        category_id: recForm.category_id || null, direction: recForm.direction,
        account_id: recForm.account_id || null, frequency: recForm.frequency, next_date: recForm.next_date
      });
      if (error) throw error;
    },
    onSuccess: () => { setShowRecurring(false); setRecForm({ title: "", amount: "", category_id: "", direction: "expense", account_id: "", frequency: "monthly", next_date: new Date().toISOString().slice(0,10) }); qc.invalidateQueries({ queryKey: ["personal-recurring", profile?.id] }); toast({ title: "Recurring created" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const delRecurring = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("personal_recurring").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personal-recurring", profile?.id] }); toast({ title: "Recurring deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const exportCsv = React.useCallback(() => {
    const rows = [["date","title","amount","direction","category","account","tags"]];
    for (const e of filtered) {
      const cat = cats?.find(c => c.id === e.category_id);
      const acc = accounts?.find(a => a.id === e.account_id);
      const eTags = tagsForNote(e.id).map(t => t.name).join(";");
      rows.push([e.entry_date, e.title, String(e.amount ?? 0), e.direction, cat?.name ?? "", acc?.name ?? "", eTags]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ledger-${curKey}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported CSV" });
  }, [filtered, cats, accounts, tagsForNote, curKey, toast]);

  const saveTemplate = React.useCallback((e: Entry) => {
    const tpl: Template = { title: e.title, amount: String(e.amount ?? 0), category_id: e.category_id ?? "", direction: (e.direction as "expense" | "income") ?? "expense", account_id: e.account_id ?? "" };
    const next = [tpl, ...templates.filter(t => t.title !== tpl.title)].slice(0, 10);
    setTemplates(next);
    try { localStorage.setItem("space-templates", JSON.stringify(next)); } catch { /* */ }
    toast({ title: "Template saved" });
  }, [templates, toast]);

  const applyTemplate = React.useCallback((tpl: Template) => {
    setTxType(tpl.direction);
    setForm({ title: tpl.title, body: "", amount: tpl.amount, category_id: tpl.category_id, account_id: tpl.account_id, to_account_id: "", entry_date: new Date().toISOString().slice(0,10) });
    setEditing(null); setFormErr(null); setShowAdd(true); setShowTemplates(false);
  }, []);

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
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />Export</Button>
        <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)}><Bookmark className="h-4 w-4 mr-1" />Templates</Button>
        <Button variant="outline" size="sm" onClick={() => setShowRecurring(true)}><Repeat className="h-4 w-4 mr-1" />Recurring</Button>
        <Button variant="outline" size="sm" onClick={() => setShowAcc(true)}><Plus className="h-4 w-4 mr-1" />Ledger</Button>
        <Button size="sm" onClick={() => openAdd("expense")}><Plus className="h-4 w-4 mr-1" />Transaction</Button>
      </div>
    </div>

    {/* Stats Summary — inside Card like Dashboard */}
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">This Month</CardTitle></CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center gap-2 mb-2 text-[11px]">
          {lastMonth.exp.greaterThan(0) ? (() => {
            const pct = monthTotals.exp.sub(lastMonth.exp).div(lastMonth.exp).mul(100);
            const up = pct.greaterThan(0);
            return <span className={cn("font-medium", up ? "text-rose-600" : "text-emerald-600")}>{up ? "↑" : "↓"} {Math.abs(pct.toNumber()).toFixed(0)}% vs last month</span>;
          })() : <span className="text-muted-foreground">No data for last month</span>}
        </div>
        <div className="mb-3">
          <div className="text-[10px] text-muted-foreground mb-1">Daily Spending</div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = String(i + 1).padStart(2, "0");
              const val = heatmap.get(day) ?? 0;
              const intensity = maxHeat > 0 ? val / maxHeat : 0;
              const bg = val === 0 ? "bg-muted/30" : intensity < 0.33 ? "bg-rose-200 dark:bg-rose-900" : intensity < 0.66 ? "bg-rose-400 dark:bg-rose-700" : "bg-rose-600 dark:bg-rose-500";
              return <div key={i} className={cn("aspect-square rounded-[3px]", bg)} title={`${day}: ${formatMoney(val)}`} />;
            })}
          </div>
        </div>
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
          <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="h-8 text-xs"><option value="all">All Tags</option>{(tags ?? []).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <div className="flex items-center rounded-full border bg-card p-0.5">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full" onClick={() => shift(-1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="min-w-[90px] text-center text-[11px] font-semibold capitalize">{monthLabel}</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full" onClick={() => shift(1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
          {ym.y !== now0.getFullYear() || ym.m !== now0.getMonth() ? (
            <Button variant="outline" size="sm" className="h-8 rounded-full text-[11px] px-2.5 gap-1" onClick={() => setYm({ y: now0.getFullYear(), m: now0.getMonth() })}><CalendarClock className="h-3 w-3" />Now</Button>
          ) : null}
          {(q || catFilter !== "all") && (
            <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => { setQ(""); setCatFilter("all"); setTagFilter("all"); }}>Clear</Button>
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
                        <SwipeRow key={e.id} actions={[{ label: "Edit", onClick: () => openEdit(e) }, { label: "Delete", kind: "destructive", onClick: () => setConfirmDelete(e.id) }]}>
                        <div className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-muted/30 active:bg-muted/50 transition-colors group cursor-pointer" onClick={() => openEdit(e)}>
                          <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0 bg-gradient-to-br shadow-sm", iconGrad)}><Icon className="h-3.5 w-3.5" /></span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-[13px] truncate">{e.title}</span>
                              {isTransfer && <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">transfer</Badge>}{tagsForNote(e.id).map(t => <Badge key={t.id} variant="outline" className="text-[8px] h-3.5 px-1 shrink-0 border-rose-300 text-rose-600">{t.name}</Badge>)}
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
                          <div className="hidden sm:flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all"><button onClick={(ev) => { ev.stopPropagation(); saveTemplate(e); }} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-amber-600 hover:bg-amber-50"><Bookmark className="h-3.5 w-3.5" /></button><button onClick={(ev) => { ev.stopPropagation(); setConfirmDelete(e.id); }} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button></div>
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
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Tags</Label>
              <button type="button" onClick={()=>setShowTagMgr(true)} className="text-[10px] text-primary hover:underline">Manage</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(tags ?? []).map(t => {
                const sel = selectedTagIds.includes(t.id);
                return <button key={t.id} type="button" onClick={()=>setSelectedTagIds(sel ? selectedTagIds.filter(id=>id!==t.id) : [...selectedTagIds, t.id])} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all", sel ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:border-primary/50")}><span className={cn("h-1.5 w-1.5 rounded-full", sel ? "bg-white" : `bg-${t.color}-500`)} />{t.name}</button>;
              })}
              {(tags ?? []).length === 0 && <span className="text-[10px] text-muted-foreground">No tags — create in Manage</span>}
            </div>
          </div>
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

    {/* Monthly Report */}
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><BarChart3 className="h-4 w-4" />Monthly Report</CardTitle></CardHeader>
      <CardContent className="text-sm space-y-2">
        <div className="flex justify-between"><span className="text-muted-foreground">Total spent</span><span className="font-semibold">{formatMoney(monthReport.total)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Transactions</span><span className="font-semibold">{monthReport.txCount}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Daily average</span><span className="font-semibold">{formatMoney(monthReport.avgPerDay)}</span></div>
        {monthReport.topCats.length > 0 && <div className="pt-2 border-t"><div className="text-xs text-muted-foreground mb-1">Top categories</div>
          {monthReport.topCats.map(([name, amt]) => <div key={name} className="flex justify-between text-xs py-0.5"><span>{name}</span><span className="font-medium">{formatMoney(amt)} ({monthReport.total > 0 ? Math.round(amt/monthReport.total*100) : 0}%)</span></div>)}
        </div>}
      </CardContent>
    </Card>

    {/* Tag Manager Dialog */}
    <Dialog open={showTagMgr} onOpenChange={setShowTagMgr}>
      <DialogHeader><DialogTitle>Manage Tags</DialogTitle></DialogHeader>
      <DialogContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={newTagName} onChange={(e)=>setNewTagName(e.target.value)} placeholder="Tag name" className="flex-1" maxLength={30} />
          <Select value={newTagColor} onChange={(e)=>setNewTagColor(e.target.value)} className="w-24">{TAG_COLORS.map(c => <option key={c} value={c}>{c}</option>)}</Select>
          <Button size="sm" onClick={()=>saveTag.mutate()} disabled={saveTag.isPending || !newTagName.trim()}>Add</Button>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto">
          {(tags ?? []).length === 0 && <span className="text-xs text-muted-foreground">No tags yet</span>}
          {(tags ?? []).map(t => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs group">
              <span className={cn("h-2 w-2 rounded-full", `bg-${t.color}-500`)} />{t.name}
              <button onClick={()=>delTag.mutate(t.id)} className="opacity-0 group-hover:opacity-100 text-destructive"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      </DialogContent>
    </Dialog>

    {/* Recurring Transactions Dialog */}
    <Dialog open={showRecurring} onOpenChange={setShowRecurring}>
      <DialogHeader><DialogTitle>Recurring Transactions</DialogTitle><DialogDescription>Auto-generate entries on schedule</DialogDescription></DialogHeader>
      <DialogContent className="space-y-3">
        <div className="space-y-2">
          <Input value={recForm.title} onChange={(e)=>setRecForm({...recForm,title:e.target.value})} placeholder="e.g. Rent, Salary" />
          <Input value={recForm.amount} onChange={(e)=>setRecForm({...recForm,amount:e.target.value})} inputMode="decimal" placeholder="Amount" className="font-semibold tabular" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={recForm.direction} onChange={(e)=>setRecForm({...recForm,direction:e.target.value as "expense"|"income"})}><option value="expense">Expense</option><option value="income">Income</option></Select>
            <Select value={recForm.frequency} onChange={(e)=>setRecForm({...recForm,frequency:e.target.value})}>{FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={recForm.account_id} onChange={(e)=>setRecForm({...recForm,account_id:e.target.value})}><option value="">Account</option>{accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            <Input type="date" value={recForm.next_date} onChange={(e)=>setRecForm({...recForm,next_date:e.target.value})} />
          </div>
        </div>
        <Button onClick={()=>saveRecurring.mutate()} disabled={saveRecurring.isPending || !recForm.title.trim() || !recForm.amount} className="w-full">Create Recurring</Button>
        {(recurring ?? []).length > 0 && <div className="border-t pt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
          {(recurring ?? []).map(r => (
            <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-muted/30 text-sm">
              <div className="min-w-0"><div className="font-medium truncate">{r.title}</div><div className="text-xs text-muted-foreground">{formatMoney(r.amount)} • {r.frequency} • next {r.next_date}</div></div>
              <button onClick={()=>delRecurring.mutate(r.id)} className="shrink-0 text-destructive hover:bg-destructive/10 rounded p-1"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>}
      </DialogContent>
    </Dialog>

    {/* Templates Dialog */}
    <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
      <DialogHeader><DialogTitle>Transaction Templates</DialogTitle><DialogDescription>Quick-fill from saved templates</DialogDescription></DialogHeader>
      <DialogContent>
        {templates.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">No templates yet. Hover over a transaction and click the bookmark icon to save it as a template.</div>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {templates.map((t, i) => (
              <button key={i} onClick={()=>applyTemplate(t)} className="w-full flex items-center justify-between py-2 px-3 rounded-lg border hover:bg-muted/30 transition-colors text-sm text-left">
                <div className="min-w-0"><div className="font-medium truncate">{t.title}</div><div className="text-xs text-muted-foreground">{t.direction} • {cats?.find(c=>c.id===t.category_id)?.name ?? "No category"}</div></div>
                <span className="font-semibold tabular shrink-0 ml-2">{formatMoney(Number(t.amount))}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Tag Picker (in add/edit dialog - appended to form) */}
  </div></PullToRefresh>;
}