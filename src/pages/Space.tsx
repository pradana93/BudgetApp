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
import { Lock, Pin, Plus, Trash2, ShieldCheck, Search, Tag, Check, X } from "lucide-react";

type Note = { id: string; title: string; body: string; amount: number | null; category_id: string | null; pinned: boolean; updated_at: string };
type PCat = { id: string; name: string; color: string };

const COLORS = ["blue", "violet", "emerald", "amber", "rose"];
const colorChip: Record<string, string> = {
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

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
  const [newCat, setNewCat] = React.useState("");
  const [newCatColor, setNewCatColor] = React.useState("blue");
  const [confirmDel, setConfirmDel] = React.useState<string | null>(null);

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
      const { data, error } = await supabase.from("personal_categories").select("id,name,color").order("name");
      if (error) throw error;
      return (data ?? []) as PCat[];
    },
    enabled: !!profile,
  });

  React.useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`personal-notes-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_notes" }, () => {
        qc.invalidateQueries({ queryKey: ["personal-notes", profile.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, profile]);

  const save = useMutation({
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
      qc.invalidateQueries({ queryKey: ["personal-notes", profile?.id] });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal-notes", profile?.id] }),
    onError: (e: Error) => toast({ title: t("space.failed"), description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personal_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["personal-notes", profile?.id] });
      toast({ title: t("space.deleted") });
    },
    onError: (e: Error) => toast({ title: t("space.failed"), description: e.message, variant: "destructive" }),
  });

  const addCat = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no user");
      const name = newCat.trim().slice(0, 60);
      if (!name) return;
      const { error } = await supabase.from("personal_categories").insert({ user_id: profile.id, name, color: newCatColor });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewCat("");
      qc.invalidateQueries({ queryKey: ["personal-cats", profile?.id] });
      toast({ title: t("space.catAdded") });
    },
    onError: (e: Error) => toast({ title: t("space.failed"), description: e.message, variant: "destructive" }),
  });

  const openNew = () => {
    setDraft(emptyDraft());
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

  const catName = (id: string | null) => cats?.find((c) => c.id === id);
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (notes ?? []).filter((n) => {
      if (catFilter !== "all" && (n.category_id ?? "") !== catFilter) return false;
      if (needle && !`${n.title} ${n.body}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [notes, q, catFilter]);
  const totalSum = filtered.reduce((s, n) => s + (n.amount ? Number(n.amount) : 0), 0);

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
        <Button variant="secondary" onClick={openNew} className="relative shrink-0"><Plus className="h-4 w-4 mr-1.5" />{t("space.new")}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("space.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-auto" aria-label={t("space.cats")}>
          <option value="all">{t("space.all")}</option>
          {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("space.total")}</span>
          <span className="font-bold tabular">{formatMoney(totalSum)}</span>
        </div>
      </div>

      {cats && cats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <span key={c.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colorChip[c.color] ?? colorChip.blue}`}>
              <Tag className="h-3 w-3" /> {c.name}
            </span>
          ))}
        </div>
      )}

      {(notes?.length ?? 0) === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 p-3 text-white shadow-lg"><Lock className="h-6 w-6" /></span>
          <div className="font-semibold text-lg">{t("space.emptyTitle")}</div>
          <p className="text-sm text-muted-foreground max-w-sm">{t("space.emptyBody")}</p>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" />{t("space.new")}</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((n) => {
            const cat = catName(n.category_id);
            return (
              <Card key={n.id} className={`card-lift flex flex-col ${n.pinned ? "ring-1 ring-primary/50" : ""}`}>
                <CardContent className="pt-5 flex flex-col gap-2 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold leading-snug line-clamp-2">{n.title}</span>
                    {n.pinned && <Pin className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  {n.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">{n.body}</p>}
                  <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
                    {n.amount != null && <span className="font-bold tabular text-sm">{formatMoney(Number(n.amount))}</span>}
                    {cat && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colorChip[cat.color] ?? colorChip.blue}`}>{cat.name}</span>}
                    <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(n.updated_at, lang)}</span>
                  </div>
                  <div className="flex gap-1 border-t border-border/50 pt-2">
                    <Button size="sm" variant="ghost" onClick={() => togglePin.mutate(n)} aria-label={n.pinned ? t("space.unpin") : t("space.pin")}>
                      <Pin className={`h-3.5 w-3.5 mr-1 ${n.pinned ? "rotate-45" : ""}`} />{n.pinned ? t("space.unpin") : t("space.pin")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(n)}>{t("space.editing")}</Button>
                    {confirmDel === n.id ? (
                      <span className="ml-auto flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)} aria-label={t("space.cancel")}><X className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => del.mutate(n.id)}><Check className="h-3.5 w-3.5" /></Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => setConfirmDel(n.id)} aria-label={t("space.delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && <div className="col-span-full text-sm text-muted-foreground text-center py-10">{t("req.noMatch")}</div>}
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          <div className="text-sm font-semibold mb-2">{t("space.cats")}</div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => setNewCatColor(c)}
                className={`h-7 w-7 rounded-full ${colorChip[c].split(" ")[0]} ring-offset-2 transition-all ${newCatColor === c ? "ring-2 ring-primary" : "hover:scale-110"}`} />
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <Input placeholder={t("space.newCat")} value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={60} className="sm:max-w-[240px]" />
            <Button variant="outline" onClick={() => addCat.mutate()} disabled={addCat.isPending || !newCat.trim()} className="shrink-0">
              <Plus className="h-4 w-4 mr-1.5" />{t("admin.add")}
            </Button>
          </div>
        </CardContent>
      </Card>

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
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1 sm:flex-none sm:min-w-[140px]">{save.isPending ? t("common.loading") : t("space.save")}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
