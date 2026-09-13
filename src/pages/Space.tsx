import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { timeAgo } from "@/lib/datetime";
import { Lock, Pin, Plus, Trash2, ShieldCheck, Search, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Note = { id: string; title: string; body: string; amount: number | null; category_id: string | null; pinned: boolean; created_at: string; updated_at: string };
type PCat = { id: string; name: string; color: string; monthly_budget: number | null };

const COLORS: { id: string; dot: string; chip: string }[] = [
  { id: "blue", dot: "bg-blue-500", chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { id: "violet", dot: "bg-violet-500", chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { id: "emerald", dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { id: "amber", dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { id: "rose", dot: "bg-rose-500", chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
];
const colorOf = (c: string) => COLORS.find((x) => x.id === c) ?? COLORS[0];

const inThisMonth = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

/** Click-to-edit cell: text or number, Enter/blur save, Escape cancels. */
function InlineCell({ value, kind = "text", onCommit, placeholder, className }: {
  value: string; kind?: "text" | "number"; onCommit: (v: string) => Promise<boolean> | boolean; placeholder?: string; className?: string;
}) {
  const { t } = useLang();
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (!editing) setVal(value); }, [value, editing]);

  const commit = async () => {
    if (val.trim() === value.trim()) { setEditing(false); return; }
    setSaving(true);
    const ok = await onCommit(val.trim());
    setSaving(false);
    if (ok !== false) setEditing(false);
  };

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className={cn("w-full rounded-md px-2 py-1 text-left hover:bg-accent/60 transition-colors cursor-text", className)}
        title={t("space.clickToEdit")}
      >
        {value || <span className="text-muted-foreground italic">{placeholder}</span>}
      </button>
    );
  }
  return (
    <span className="relative block">
      <input
        autoFocus
        type={kind === "number" ? "number" : "text"}
        min={kind === "number" ? 0 : undefined}
        step={kind === "number" ? "any" : undefined}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setVal(value); setEditing(false); }
        }}
        className="w-full rounded-md border border-primary/50 bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {saving && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />}
    </span>
  );
}

type Draft = { title: string; body: string; amount: string; category_id: string; pinned: boolean };
const emptyDraft = (): Draft => ({ title: "", body: "", amount: "", category_id: "", pinned: false });

export default function Space() {
  const { profile } = useSession();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [catFilter, setCatFilter] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formErr, setFormErr] = React.useState<string | null>(null);
  const [newCatName, setNewCatName] = React.useState("");
  const [newCatBudget, setNewCatBudget] = React.useState("");
  const [newCatColor, setNewCatColor] = React.useState("blue");
  const [confirmNoteDel, setConfirmNoteDel] = React.useState<string | null>(null);
  const [confirmCatDel, setConfirmCatDel] = React.useState<string | null>(null);

  const { data: notes } = useQuery({
    queryKey: ["personal-notes", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_notes").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Note[];
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
    const ch = supabase.channel(`personal-space-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_notes" }, () => {
        qc.invalidateQueries({ queryKey: ["personal-notes", profile.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_categories" }, () => {
        qc.invalidateQueries({ queryKey: ["personal-cats", profile.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, profile]);

  const invalidateNotes = () => qc.invalidateQueries({ queryKey: ["personal-notes", profile?.id] });
  const invalidateCats = () => qc.invalidateQueries({ queryKey: ["personal-cats", profile?.id] });

  const saveNote = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no user");
      const title = draft.title.trim();
      if (!title) throw new Error(t("space.titleReq"));
      const amt = draft.amount.trim();
      if (amt && !(isValidMoney(amt) && Number(amt) >= 0)) throw new Error(t("v.amountGt"));
      const payload = {
        user_id: profile.id,
        title: title.slice(0, 120),
        body: draft.body.slice(0, 4000),
        amount: amt ? Number(amt) : null,
        category_id: draft.category_id || null,
        pinned: draft.pinned,
      };
      if (editingId) {
        const { error } = await supabase.from("personal_notes").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("personal_notes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setOpen(false);
      invalidateNotes();
      toast({ title: t("space.saved") });
    },
    onError: (e: Error) => {
      setFormErr(e.message);
      toast({ title: t("space.failed"), description: e.message, variant: "destructive" });
    },
  });

  const togglePin = useMutation({
    mutationFn: async (n: Note) => {
      const { error } = await supabase.from("personal_notes").update({ pinned: !n.pinned }).eq("id", n.id);
      if (error) throw error;
    },
    onSuccess: invalidateNotes,
    onError: (e: Error) => toast({ title: t("space.failed"), description: e.message, variant: "destructive" }),
  });

  const delNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personal_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setConfirmNoteDel(null); invalidateNotes(); toast({ title: t("space.deleted") }); },
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
    onSuccess: () => {
      setNewCatName(""); setNewCatBudget("");
      invalidateCats();
      toast({ title: t("space.catAdded") });
    },
    onError: (e: Error) => toast({ title: t("space.failed"), description: e.message, variant: "destructive" }),
  });

  const patchCat = async (id: string, patch: Partial<PCat>): Promise<boolean> => {
    const { error } = await supabase.from("personal_categories").update(patch).eq("id", id);
    if (error) { toast({ title: t("space.failed"), description: error.message, variant: "destructive" }); return false; }
    invalidateCats();
    return true;
  };

  const delCat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personal_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmCatDel(null);
      invalidateCats();
      invalidateNotes();
      toast({ title: t("space.catDeleted") });
    },
    onError: (e: Error) => toast({ title: t("space.failed"), description: e.message, variant: "destructive" }),
  });

  const openNew = (categoryId = "") => {
    setDraft({ ...emptyDraft(), category_id: categoryId });
    setEditingId(null);
    setFormErr(null);
    setOpen(true);
  };
  const openEdit = (n: Note) => {
    setDraft({ title: n.title, body: n.body, amount: n.amount != null ? String(n.amount) : "", category_id: n.category_id ?? "", pinned: n.pinned });
    setEditingId(n.id);
    setFormErr(null);
    setOpen(true);
  };

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (notes ?? []).filter((n) => {
      if (catFilter !== "all" && (n.category_id ?? "none") !== catFilter) return false;
      if (needle && !`${n.title} ${n.body}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [notes, q, catFilter]);

  const spentByCat = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes ?? []) {
      if (n.amount == null || !inThisMonth(n.created_at)) continue;
      const key = n.category_id ?? "__none";
      map.set(key, (map.get(key) ?? 0) + Number(n.amount));
    }
    return map;
  }, [notes]);

  const groups = React.useMemo(() => {
    const byCat = new Map<string, Note[]>();
    for (const n of filtered) {
      const key = n.category_id ?? "__none";
      const arr = byCat.get(key) ?? [];
      arr.push(n);
      byCat.set(key, arr);
    }
    const out: { cat: PCat | null; items: Note[] }[] = [];
    const none = byCat.get("__none");
    if (none) out.push({ cat: null, items: none });
    for (const c of cats ?? []) {
      const items = byCat.get(c.id);
      if (items) out.push({ cat: c, items });
    }
    return out;
  }, [filtered, cats]);

  const totalPlan = (cats ?? []).reduce((s, c) => s + (c.monthly_budget ? Number(c.monthly_budget) : 0), 0);
  const totalSpent = [...spentByCat.values()].reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="rounded-2xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 text-white p-6 flex flex-wrap items-center gap-4 shadow-lg overflow-hidden relative">
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <span className="relative rounded-2xl bg-white/15 p-3 backdrop-blur shrink-0"><Lock className="h-7 w-7" /></span>
        <div className="relative flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">{t("space.title")}</h1>
          <p className="text-sm text-white/85 mt-0.5">{t("space.sub")}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-white/75">
            <ShieldCheck className="h-3.5 w-3.5" /> Row-level security keeps these private from every other account.
          </p>
        </div>
        <div className="relative flex flex-wrap gap-2 shrink-0">
          <Button variant="secondary" onClick={() => openNew()}><Plus className="h-4 w-4 mr-1.5" />{t("space.new")}</Button>
          <div className="text-right">
            <div className="text-xs text-white/70">{t("space.colSpent")} / {t("space.colBudget")}</div>
            <div className="font-bold tabular">{formatMoney(totalSpent)} / {formatMoney(totalPlan)}</div>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <div className="text-sm font-semibold">{t("space.budgets")}</div>
              <div className="text-xs text-muted-foreground">{t("space.budgetSub")}</div>
            </div>
            <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-auto h-9 text-xs" aria-label={t("space.cats")}>
              <option value="all">{t("space.all")}</option>
              <option value="none">{t("space.fNone")}</option>
              {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>

          <div className="hidden sm:grid grid-cols-[1fr_150px_150px_150px_160px_36px] gap-2 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{t("space.colCat")}</span><span>{t("space.colBudget")}</span><span>{t("space.colSpent")}</span><span>{t("space.colLeft")}</span><span />
          </div>

          {cats?.map((c) => {
            const spent = spentByCat.get(c.id) ?? 0;
            const budget = c.monthly_budget ? Number(c.monthly_budget) : 0;
            const left = budget - spent;
            const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            const over = budget > 0 && spent > budget;
            return (
              <div key={c.id} className="grid grid-cols-2 sm:grid-cols-[1fr_150px_150px_150px_160px_36px] gap-2 items-center border-t py-1.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-3 w-3 rounded-full shrink-0 ${colorOf(c.color).dot}`} />
                  <InlineCell value={c.name} onCommit={(v) => v ? patchCat(c.id, { name: v.slice(0, 60) }) : true} className="font-medium truncate" />
                </div>
                <div>
                  <InlineCell value={c.monthly_budget != null ? String(c.monthly_budget) : ""} kind="number"
                    placeholder={t("space.noBudgetSet")}
                    onCommit={(v) => {
                      if (!v) return patchCat(c.id, { monthly_budget: null });
                      if (!isValidMoney(v) || Number(v) < 0) { toast({ title: t("v.invalidAmount"), variant: "destructive" }); return false; }
                      return patchCat(c.id, { monthly_budget: Number(v) });
                    }} className="tabular" />
                </div>
                <div className="tabular">{formatMoney(spent)}</div>
                <div className={cn("tabular", over && "text-destructive font-semibold")}>{c.monthly_budget != null ? formatMoney(left) : "—"}</div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={cn("h-2 rounded-full transition-all", over ? "bg-destructive" : "bg-gradient-to-r from-fuchsia-500 to-indigo-500")} style={{ width: `${pct}%` }} /></div>
                </div>
                {confirmCatDel === c.id ? (
                  <div className="col-span-2 sm:col-span-2 flex items-center gap-1 text-xs">
                    <span className="truncate">{t("space.deleteCatConfirm")}</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setConfirmCatDel(null)} aria-label={t("space.cancel")}><X className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="destructive" className="h-7 w-7 p-0" onClick={() => delCat.mutate(c.id)} aria-label={t("space.deleteCat")}><Check className="h-3.5 w-3.5" /></Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmCatDel(c.id)} aria-label={t("space.deleteCat")}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-2 sm:grid-cols-[1fr_150px_150px_150px_160px_36px] gap-2 items-center border-t pt-3">
            <div className="flex items-center gap-2 min-w-0">
              <button type="button" onClick={() => setNewCatColor(COLORS[(COLORS.findIndex((x) => x.id === newCatColor) + 1) % COLORS.length].id)}
                aria-label={t("space.catColor")}
                className={`h-3.5 w-3.5 shrink-0 rounded-full ${colorOf(newCatColor).dot} ring-offset-2 ring-1 ring-primary/40`} />
              <Input placeholder={t("space.addCategory")} value={newCatName} onChange={(e) => setNewCatName(e.target.value)} maxLength={60}
                onKeyDown={(e) => { if (e.key === "Enter" && newCatName.trim()) { e.preventDefault(); addCat.mutate(); } }}
                className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0" />
            </div>
            <Input placeholder={t("space.noBudgetSet")} value={newCatBudget} onChange={(e) => setNewCatBudget(e.target.value)} inputMode="decimal" maxLength={14}
              onKeyDown={(e) => { if (e.key === "Enter" && newCatName.trim()) { e.preventDefault(); addCat.mutate(); } }}
              className="h-8 text-sm" />
            <div className="col-span-2 sm:col-span-4 flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground hidden md:inline">{t("space.monthSpentHint")}</span>
              <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => addCat.mutate()} disabled={addCat.isPending || !newCatName.trim()}>
                <Plus className="h-3.5 w-3.5 mr-1" />{t("admin.add")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold">{t("space.blocks")}</div>
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("space.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {(notes?.length ?? 0) === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 p-3 text-white shadow-lg"><Lock className="h-6 w-6" /></span>
          <div className="font-semibold text-lg">{t("space.emptyTitle")}</div>
          <p className="text-sm text-muted-foreground max-w-sm">{t("space.emptyBody")}</p>
          <Button onClick={() => openNew()}><Plus className="h-4 w-4 mr-1.5" />{t("space.new")}</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.cat?.id ?? "none"}>
              <div className="flex items-center gap-2 mb-2">
                {g.cat ? (
                  <>
                    <span className={`h-2.5 w-2.5 rounded-full ${colorOf(g.cat.color).dot}`} />
                    <span className="text-sm font-semibold">{g.cat.name}</span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground">{t("space.fNone")}</span>
                )}
                <span className="text-xs text-muted-foreground">({g.items.length})</span>
                <Button size="sm" variant="ghost" className="h-7 ml-auto" onClick={() => openNew(g.cat?.id ?? "")}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{t("space.new")}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.items.map((n) => (
                  <Card key={n.id} className={cn("card-lift", n.pinned && "ring-1 ring-primary/50")}>
                    <CardContent className="pt-4 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <p className="font-semibold text-sm leading-snug flex-1 min-w-0 break-words">
                          <InlineCell value={n.title} onCommit={async (v) => {
                            if (!v) return true;
                            const { error } = await supabase.from("personal_notes").update({ title: v.slice(0, 120) }).eq("id", n.id);
                            if (error) { toast({ title: t("space.failed"), description: error.message, variant: "destructive" }); return false; }
                            invalidateNotes();
                            return true;
                          }} />
                        </p>
                        {n.pinned && <Pin className="h-4 w-4 text-primary shrink-0 mt-2" />}
                      </div>
                      {n.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{n.body}</p>}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {n.amount != null && (
                          <span className="font-bold tabular text-sm">
                            <InlineCell value={String(n.amount)} kind="number" onCommit={async (v) => {
                              if (!v) {
                                const { error } = await supabase.from("personal_notes").update({ amount: null }).eq("id", n.id);
                                if (error) { toast({ title: t("space.failed"), description: error.message, variant: "destructive" }); return false; }
                                invalidateNotes();
                                return true;
                              }
                              if (!isValidMoney(v) || Number(v) < 0) { toast({ title: t("v.amountGt"), variant: "destructive" }); return false; }
                              const { error } = await supabase.from("personal_notes").update({ amount: Number(v) }).eq("id", n.id);
                              if (error) { toast({ title: t("space.failed"), description: error.message, variant: "destructive" }); return false; }
                              invalidateNotes();
                              return true;
                            }} />
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground ml-auto">{timeAgo(n.updated_at, lang)}</span>
                      </div>
                      <div className="flex gap-1 border-t border-border/50 pt-1.5">
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => togglePin.mutate(n)}>
                          <Pin className={cn("h-3.5 w-3.5 mr-1", n.pinned && "rotate-45")} />{n.pinned ? t("space.unpin") : t("space.pin")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(n)}>{t("profile.editTitle")}</Button>
                        {confirmNoteDel === n.id ? (
                          <span className="ml-auto flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setConfirmNoteDel(null)} aria-label={t("space.cancel")}><X className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="destructive" className="h-7 w-7 p-0" onClick={() => delNote.mutate(n.id)} aria-label={t("space.delete")}><Check className="h-3.5 w-3.5" /></Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 ml-auto text-destructive hover:text-destructive" onClick={() => setConfirmNoteDel(n.id)} aria-label={t("space.delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
          {groups.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">{t("req.noMatch")}</div>}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 p-2.5 text-white shadow-md shrink-0"><Lock className="h-5 w-5" /></span>
            <div className="min-w-0">
              <DialogTitle>{editingId ? t("space.editing") : t("space.new")}</DialogTitle>
              <DialogDescription>{t("space.sub")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4">
            <div>
              <Label>{t("space.fTitle")}</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} autoFocus />
              {formErr && !draft.title.trim() && <div className="text-sm text-destructive mt-1">{t("space.titleReq")}</div>}
            </div>
            <div>
              <Label>{t("space.fBody")}</Label>
              <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={4} maxLength={4000} />
              <div className="text-right text-xs text-muted-foreground tabular mt-1">{draft.body.length}/4000</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{t("space.fAmount")}</Label>
                <Input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} inputMode="decimal" placeholder="0" />
              </div>
              <div>
                <Label>{t("space.fCategory")}</Label>
                <Select value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}>
                  <option value="">{t("space.fNone")}</option>
                  {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} className="h-4 w-4 rounded border-input accent-primary" />
              {t("space.pin")}
            </label>
            {formErr && draft.title.trim() && <div className="text-sm text-destructive">{formErr}</div>}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="flex-1 sm:flex-none">{t("common.cancel")}</Button>
          <Button onClick={() => saveNote.mutate()} disabled={saveNote.isPending} className="flex-1 sm:flex-none sm:min-w-[140px]">{saveNote.isPending ? t("common.loading") : t("space.save")}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
