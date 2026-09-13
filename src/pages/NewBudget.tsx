import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/i18n/LanguageContext";
import { getBudgetSchema } from "@/schemas/budget";
import { formatMoney, isValidMoney } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { ArrowLeft, Wallet, Check } from "lucide-react";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function NewBudget() {
  const { profile } = useSession();
  const { toast } = useToast();
  const { t, lang } = useLang();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = React.useState({ name: "", total_amount: "", currency: "IDR", period_start: "", period_end: "" });
  const [fieldErrs, setFieldErrs] = React.useState<Record<string, string[]>>({});

  const schema = React.useMemo(
    () => getBudgetSchema({ nameRequired: t("v.nameRequired"), invalidAmount: t("v.invalidAmount"), endGteStart: t("v.endGteStart") }),
    [t]
  );

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({ ...form });
      const { data, error } = await supabase.from("budgets").insert({
        name: parsed.name,
        total_amount: Number(parsed.total_amount),
        currency: parsed.currency ?? "IDR",
        period_start: parsed.period_start || null,
        period_end: parsed.period_end || null,
        owner_id: profile!.id,
      }).select("id").single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: t("budgets.created") });
      nav(`/budgets/${data.id}`);
    },
    onError: (e: Error) => toast({ title: t("budgets.failed"), description: e.message, variant: "destructive" }),
  });

  const onCreate = () => {
    const r = schema.safeParse({ ...form });
    if (!r.success) {
      setFieldErrs(r.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setFieldErrs({});
    mut.mutate();
  };

  const setPreset = (which: "month" | "next" | "quarter") => {
    const now = new Date();
    let start: Date;
    let end: Date;
    if (which === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (which === "next") {
      start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    } else {
      const q = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), q, 1);
      end = new Date(now.getFullYear(), q + 3, 0);
    }
    setForm({ ...form, period_start: iso(start), period_end: iso(end) });
  };

  const bump = (n: number) => setForm({ ...form, total_amount: String((Number(form.total_amount) || 0) + n) });
  const valid = isValidMoney(form.total_amount);
  const days = form.period_start && form.period_end
    ? Math.max(0, Math.round((new Date(form.period_end).getTime() - new Date(form.period_start).getTime()) / 86400000))
    : null;
  const perDay = valid && days ? Number(form.total_amount) / days : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/budgets" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("budgets.backToBudgets")}
      </Link>

      <div className="rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 text-white p-6 md:p-8 flex items-center gap-4 overflow-hidden relative">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <span className="rounded-2xl bg-white/15 p-3 backdrop-blur shrink-0"><Wallet className="h-7 w-7" /></span>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("budgets.dialogTitle")}</h1>
          <p className="text-sm text-white/85 mt-1">{t("budgets.dialogSub")}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
        <div className="space-y-6">
          <Card className="animate-fade-up">
            <CardHeader><CardTitle className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>{t("budgets.s1")}</CardTitle></CardHeader>
            <CardContent>
              <Label>{t("budgets.name")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("budgets.phName")} maxLength={200} className="mt-1.5 h-11 text-base" />
              {fieldErrs.name?.[0] && <div className="text-sm text-destructive mt-1">{fieldErrs.name[0]}</div>}
            </CardContent>
          </Card>

          <Card className="animate-fade-up" >
            <CardHeader><CardTitle className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>{t("budgets.s2")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-stretch gap-2">
                <Input value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} placeholder={t("budgets.phTotal")} inputMode="decimal" className="h-12 text-lg font-semibold tabular flex-1" />
                <span className="flex rounded-lg border border-input overflow-hidden shrink-0" role="group" aria-label={t("budgets.currency")}>
                  {(["IDR", "USD"] as const).map((c) => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, currency: c })}
                      className={`px-4 text-sm font-medium transition-colors ${form.currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>{c}</button>
                  ))}
                </span>
              </div>
              {fieldErrs.total_amount?.[0] && <div className="text-sm text-destructive">{fieldErrs.total_amount[0]}</div>}
              {form.currency === "IDR" && (
                <div className="flex flex-wrap gap-2">
                  {[1000000, 5000000, 10000000].map((n) => (
                    <Button key={n} type="button" size="sm" variant="outline" onClick={() => bump(n)}>+{(n / 1000000).toLocaleString()} jt</Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader><CardTitle className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>{t("budgets.s3")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setPreset("month")}>{t("budgets.presetMonth")}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPreset("next")}>{t("budgets.presetNext")}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPreset("quarter")}>{t("budgets.presetQuarter")}</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>{t("budgets.fStart")}</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className="mt-1.5" /></div>
                <div><Label>{t("budgets.fEnd")}</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className="mt-1.5" />
                  {fieldErrs.period_end?.[0] && <div className="text-sm text-destructive mt-1">{fieldErrs.period_end[0]}</div>}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-6">
          <Card className="overflow-hidden border-primary/25 shadow-xl shadow-primary/10">
            <div className="bg-gradient-to-br from-blue-600 to-violet-700 text-white p-5">
              <div className="text-xs uppercase tracking-wider text-white/70">{t("budgets.summary")}</div>
              <div className="mt-1 text-3xl font-bold tabular">
                {valid ? formatMoney(Number(form.total_amount), form.currency || "IDR") : "—"}
              </div>
              <div className="mt-1 text-sm text-white/80">
                {form.name || t("budgets.phName")} • {form.currency}
              </div>
            </div>
            <CardContent className="pt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("budgets.fStart")} – {t("budgets.fEnd")}</span>
                <span className="font-medium">{form.period_start ? formatDate(form.period_start, lang) : "—"} → {form.period_end ? formatDate(form.period_end, lang) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("budgets.periodDays", { n: days ?? 0 })}</span>
                <span className="font-medium tabular">{perDay !== null && days ? `${formatMoney(perDay, form.currency || "IDR")} ${t("budgets.perDay")}` : "—"}</span></div>
              <Button onClick={onCreate} disabled={mut.isPending} className="w-full h-11 text-base mt-2">
                {mut.isPending ? t("budgets.creating") : <><Check className="h-4 w-4 mr-2" />{t("budgets.create")}</>}
              </Button>
              <CardDescription className="text-xs text-center">{t("budgets.dialogSub")}</CardDescription>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
