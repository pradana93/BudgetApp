import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/i18n/LanguageContext";
import { useCategories, normalizeCategory } from "@/hooks/useCategories";
import { suggestCategory } from "@/lib/matcher";
import { findDuplicates } from "@/lib/advisor";
import { formatMoney, isValidMoney } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { Sparkles, Check } from "lucide-react";
import { getRequestSchema } from "@/schemas/budget";
import { z } from "zod";

const DRAFT_KEY = "budgetapp-draft-request";
const STEPS = ["new.stepBudget", "new.stepDetails", "new.stepReview"] as const;

export default function NewRequest(){
  const { profile } = useSession();
  const { toast } = useToast();
  const { t, lang } = useLang();
  const nav = useNavigate();
  const [step, setStep] = React.useState(0);
  const [form,setForm]=React.useState({ budget_id:"", amount:"", category:"groceries" as string, merchant:"", description:"", due_date:"" });
  const [file,setFile]=React.useState<File|null>(null);
  const [err,setErr]=React.useState<string|null>(null);
  const [stepErr,setStepErr]=React.useState<string|null>(null);
  const [draftLoaded,setDraftLoaded]=React.useState(false);

  const schema = React.useMemo(
    () => getRequestSchema({ budgetRequired: t("v.budgetRequired"), amountGt: t("v.amountGt"), categoryRequired: t("v.categoryRequired") }),
    [t]
  );
  const { categories } = useCategories();

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<typeof form>;
        setForm((f) => ({ ...f, ...d }));
        setDraftLoaded(true);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      /* storage unavailable */
    }
  }, [form]);

  const discardDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    setForm({ budget_id:"", amount:"", category:"groceries", merchant:"", description:"", due_date:"" });
    setFile(null);
    setStep(0);
    setDraftLoaded(false);
  };

  React.useEffect(() => {
    if (!categories.includes(form.category)) setForm((f) => ({ ...f, category: categories[0] ?? f.category }));
  }, [categories, form.category]);

  const [manualCat, setManualCat] = React.useState(false);
  const [proposal, setProposal] = React.useState("");
  const [proposed, setProposed] = React.useState(false);
  const [proposalErr, setProposalErr] = React.useState<string | null>(null);

  const { data: budgets } = useQuery({ queryKey:["budgets"], queryFn: async()=>{
    const { data, error } = await supabase.from("budgets").select("id,name,available_amount,currency").eq("status","active"); if(error) throw error; return data;
  }});

  const { data: history } = useQuery({
    queryKey: ["my-history"],
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase.from("reimbursement_requests").select("id,merchant,category,amount,status,created_at").eq("requester_id", profile.id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; merchant: string | null; category: string; amount: number; status: string; created_at: string }[];
    },
    enabled: !!profile,
  });

  const suggestion = React.useMemo(() => {
    if (!form.merchant.trim() && !form.amount.trim()) return null;
    return suggestCategory({ merchant: form.merchant, amount: form.amount, history: history ?? [], categories, lang });
  }, [form.merchant, form.amount, categories, history, lang]);

  React.useEffect(() => { setManualCat(false); }, [form.merchant]);

  const dupWarn = React.useMemo(() => {
    if (!form.merchant.trim() || !(Number(form.amount) > 0)) return [];
    return findDuplicates(
      { merchant: form.merchant, amount: form.amount, category: form.category, status: "pending", created_at: new Date().toISOString() },
      (history ?? []).filter((h) => h.status === "pending")
    );
  }, [form.merchant, form.amount, form.category, history]);

  React.useEffect(() => {
    if (!manualCat && suggestion?.auto && form.category !== suggestion.category) {
      setForm((f) => ({ ...f, category: suggestion.category }));
    }
  }, [suggestion, manualCat, form.category]);

  const previewUrl = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const [dragOver, setDragOver] = React.useState(false);
  const [ocr, setOcr] = React.useState<{ merchant: string; amount: string } | null>(null);
  React.useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setOcr(null); return; }
    const t = setTimeout(() => {
      // flagship mock OCR — in prod call vision API; here we simulate + auto-fill
      const mockMerchant = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").slice(0, 20) || "Detected Merchant";
      const mockAmount = form.amount.trim() ? form.amount.trim() : "150000";
      setOcr({ merchant: mockMerchant, amount: mockAmount });
      if (!form.merchant.trim()) setForm((f) => ({ ...f, merchant: mockMerchant }));
      if (!form.amount.trim()) setForm((f) => ({ ...f, amount: mockAmount }));
    }, 700);
    return () => clearTimeout(t);
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  const merchantNames = React.useMemo(
    () => [...new Set((history ?? []).map((h) => h.merchant).filter((m): m is string => !!m && m.trim().length > 0))].slice(0, 20),
    [history]
  );

  const { data: recentReceipts } = useQuery({
    queryKey: ["my-receipts"],
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase
        .from("reimbursement_requests")
        .select("id,merchant,receipt_url")
        .eq("requester_id", profile.id)
        .not("receipt_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      const out: { id: string; merchant: string | null; url: string }[] = [];
      for (const r of (data ?? []) as { id: string; merchant: string | null; receipt_url: string }[]) {
        const { data: s } = await supabase.storage.from("receipts").createSignedUrl(r.receipt_url, 300);
        if (s?.signedUrl) out.push({ id: r.id, merchant: r.merchant, url: s.signedUrl });
      }
      return out;
    },
    enabled: !!profile,
  });

  const reuseReceipt = async (url: string, merchant: string | null) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      onFile(new File([blob], `receipt-${Date.now()}.${ext}`, { type: blob.type }));
      if (merchant && !form.merchant.trim()) setForm((f) => ({ ...f, merchant }));
      toast({ title: t("new.reused") });
    } catch {
      toast({ title: t("new.failed"), variant: "destructive" });
    }
  };

  const onFile = (f: File | null) => {
    setErr(null);
    if (!f) { setFile(null); return; }
    if (f.size > 10 * 1024 * 1024) { setErr(t("new.fileTooBig")); return; }
    if (!/^image\//.test(f.type) && f.type !== "application/pdf") { setErr(t("new.badFile")); return; }
    setFile(f);
  };

  const propose = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("category_proposals").insert({ name, merchant: form.merchant.trim(), requester_id: profile!.id });
      if (error) throw error;
    },
    onSuccess: () => { setProposed(true); setProposal(""); setProposalErr(null); toast({ title: t("match.proposed") }); },
    onError: (e: Error) => toast({ title: t("new.failed"), description: e.message, variant: "destructive" }),
  });

  const onPropose = () => {
    const name = normalizeCategory(proposal || form.merchant);
    if (!name) { setProposalErr(t("match.invalidName")); return; }
    setProposalErr(null);
    propose.mutate(name);
  };

  const mut = useMutation({ mutationFn: async()=>{
    const parsed = schema.parse(form);
    const { data, error } = await supabase.from("reimbursement_requests").insert({
      budget_id: parsed.budget_id, requester_id: profile!.id, amount: Number(parsed.amount), category: parsed.category, merchant: parsed.merchant||null, description: parsed.description||null, due_date: parsed.due_date || null
    }).select().single();
    if(error) throw error;
    if(file && data){
      const path = `${profile!.id}/${data.id}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file);
      if(upErr) throw upErr;
      const { error: updErr } = await supabase.from("reimbursement_requests").update({ receipt_url: path }).eq("id", data.id);
      if(updErr) throw updErr;
    }
    return data;
  }, onSuccess:()=>{
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    toast({title:t("new.submitted")}); nav("/requests");
  }, onError:(e:Error)=> toast({title:t("new.failed"), description:e.message, variant:"destructive"}) });

  const next = ()=>{
    setStepErr(null);
    if (step === 0 && !form.budget_id) { setStepErr(t("v.budgetRequired")); return; }
    if (step === 1) {
      if (!isValidMoney(form.amount.trim()) || !(Number(form.amount) > 0)) { setStepErr(t("v.amountGt")); return; }
      if (!form.category) { setStepErr(t("v.categoryRequired")); return; }
    }
    setStep((s) => Math.min(2, s + 1));
  };

  const onSubmit = (e:React.FormEvent)=>{
    e.preventDefault();
    try{ setErr(null); schema.parse(form); mut.mutate(); } catch(ex){ if(ex instanceof z.ZodError) setErr(ex.errors[0].message); else setErr((ex as Error).message); }
  };

  const setDue = (preset: number | "month") => {
    const d = new Date();
    if (preset === "month") d.setMonth(d.getMonth() + 1, 0);
    else d.setDate(d.getDate() + preset);
    setForm({ ...form, due_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` });
  };

  const chosenBudget = budgets?.find((b) => b.id === form.budget_id);
  const amountValid = isValidMoney(form.amount.trim()) && Number(form.amount) > 0;

  return <div className="max-w-xl mx-auto">
    <h1 className="text-2xl font-bold mb-4">{t("new.title")}</h1>
    {draftLoaded && (
      <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
        <span>{t("new.draftRestored")}</span>
        <Button size="sm" variant="ghost" onClick={discardDraft}>{t("new.discardDraft")}</Button>
      </div>
    )}
    <div className="flex gap-1.5 mb-5">
      {STEPS.map((s, i) => (
        <button key={s} onClick={() => { if (i < step) setStep(i); }} disabled={i > step}
          className={`flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors ${i < step ? "bg-primary/15 text-primary" : i === step ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground"}`}>
          <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] border border-current">{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
          {t(s)}
        </button>
      ))}
    </div>
    <Card><CardHeader><CardTitle>{t(STEPS[step])}</CardTitle></CardHeader><CardContent>
      {step === 0 && (
        <div className="space-y-3">
          <Label>{t("new.pickBudget")}</Label>
          {(budgets?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground">{t("new.noBudgets")}</div>}
          <div className="grid gap-2 max-h-72 overflow-auto pr-1">
            {budgets?.map((b) => {
              const selected = form.budget_id === b.id;
              return (
                <button key={b.id} type="button" onClick={()=>{ setStepErr(null); setForm({...form,budget_id:b.id}); }}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-all ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-input hover:border-primary/50"}`}>
                  <span className="font-medium">{b.name}</span>
                  <span className="text-muted-foreground tabular whitespace-nowrap">{t("budgets.available")}: {formatMoney(Number(b.available_amount), b.currency)}</span>
                </button>
              );
            })}
          </div>
          {stepErr && <div className="text-sm text-destructive">{stepErr}</div>}
          <div className="flex justify-end"><Button onClick={next} disabled={(budgets?.length ?? 0) === 0}>{t("new.next")}</Button></div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label>{t("new.amount")}</Label>
            <Input value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder={t("new.amountPh")} inputMode="decimal" />
            {amountValid && <div className="mt-1 text-lg font-bold tabular text-gradient">{formatMoney(Number(form.amount))}</div>}
          </div>
          <div>
            <Label>{t("new.category")}</Label>
            <Select value={form.category} onChange={e=>{ setManualCat(true); setForm({...form,category:e.target.value}); }}>{categories.map((c)=><option key={c} value={c}>{c}</option>)}</Select>
          </div>
          {suggestion && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>{t("match.suggested")}: <b>{suggestion.category}</b> ({suggestion.confidence}%)</span>
                {suggestion.auto && <Badge variant="approved">{t("match.auto")}</Badge>}
                {form.category !== suggestion.category && <Button size="sm" variant="outline" onClick={()=>{ setManualCat(true); setForm({...form,category:suggestion.category}); }}>{t("match.apply")}</Button>}
              </div>
              <div className="h-1.5 rounded bg-muted overflow-hidden"><div className="h-1.5 rounded bg-gradient-to-r from-blue-500 to-violet-500 transition-all" style={{ width: `${suggestion.confidence}%` }} /></div>
              <ul className="text-xs text-muted-foreground space-y-0.5">{suggestion.reasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>
            </div>
          )}
          {form.merchant.trim() && suggestion && !suggestion.auto && suggestion.confidence <= 35 && !proposed && (
            <div className="rounded-md border border-dashed p-3 text-sm space-y-2">
              <div className="text-muted-foreground">{t("match.noMatch")}</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input placeholder={t("match.proposePh")} value={proposal} onChange={(e)=>setProposal(e.target.value)} maxLength={30} />
                <Button type="button" variant="outline" onClick={onPropose} disabled={propose.isPending}>{t("match.propose")}</Button>
              </div>
              {proposalErr && <div className="text-sm text-destructive">{proposalErr}</div>}
            </div>
          )}
          {dupWarn.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-1">
              <div className="font-semibold">{t("dup.title")}</div>
              <div className="text-muted-foreground">{t("dup.desc", { n: dupWarn.length })}</div>
            </div>
          )}
          <div><Label>{t("new.merchant")}</Label><Input value={form.merchant} onChange={e=>setForm({...form,merchant:e.target.value})} placeholder={t("new.merchantPh")} maxLength={200} list="merchant-history" />
            <datalist id="merchant-history">{merchantNames.map((m) => <option key={m} value={m} />)}</datalist></div>
          <div>
            <Label>{t("new.description")}</Label>
            <Textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder={t("new.descPh")} maxLength={1000} />
            <div className="mt-1 text-right text-xs text-muted-foreground tabular">{form.description.length}/1000</div>
          </div>
          <div>
            <Label>{t("new.dueDate")}</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              <Button type="button" size="sm" variant="outline" onClick={()=>setDue(0)}>{t("new.dueToday")}</Button>
              <Button type="button" size="sm" variant="outline" onClick={()=>setDue(3)}>{t("new.due3")}</Button>
              <Button type="button" size="sm" variant="outline" onClick={()=>setDue(7)}>{t("new.due7")}</Button>
              <Button type="button" size="sm" variant="outline" onClick={()=>setDue("month")}>{t("new.dueMonth")}</Button>
            </div>
            <Input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} />
          </div>
          {stepErr && <div className="text-sm text-destructive">{stepErr}</div>}
          <div className="flex justify-between"><Button variant="outline" onClick={()=>setStep(0)}>{t("new.back")}</Button><Button onClick={next}>{t("new.next")}</Button></div>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={onSubmit} className="space-y-4">
          <h3 className="font-semibold">{t("new.reviewTitle")}</h3>
          <dl className="rounded-lg border divide-y text-sm">
            <div className="flex justify-between gap-3 p-3"><dt className="text-muted-foreground">{t("new.budget")}</dt><dd className="font-medium text-right">{chosenBudget?.name ?? "—"}</dd></div>
            <div className="flex justify-between gap-3 p-3"><dt className="text-muted-foreground">{t("new.amount")}</dt><dd className="font-bold tabular text-right">{amountValid ? formatMoney(Number(form.amount)) : form.amount || "—"}</dd></div>
            <div className="flex justify-between gap-3 p-3"><dt className="text-muted-foreground">{t("new.category")}</dt><dd className="font-medium">{form.category || "—"}</dd></div>
            <div className="flex justify-between gap-3 p-3"><dt className="text-muted-foreground">{t("new.merchant")}</dt><dd className="font-medium text-right">{form.merchant || "—"}</dd></div>
            {form.description && <div className="flex justify-between gap-3 p-3"><dt className="text-muted-foreground">{t("new.description")}</dt><dd className="text-right max-w-[60%]">{form.description}</dd></div>}
            <div className="flex justify-between gap-3 p-3"><dt className="text-muted-foreground">{t("new.dueDate")}</dt><dd className="font-medium">{form.due_date ? formatDate(form.due_date, lang) : "—"}</dd></div>
          </dl>
          <div>
            <Label>{t("new.receipt")} <Badge variant="secondary" className="ml-1 text-[10px]">STUDIO 2.0</Badge></Label>
            {recentReceipts && recentReceipts.length > 0 && (
              <div className="mt-1.5 mb-2">
                <div className="text-xs text-muted-foreground mb-1.5">{t("new.recentReceipts")} — {t("new.tapReuse")}</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recentReceipts.map((r) => (
                    <button key={r.id} type="button" onClick={() => reuseReceipt(r.url, r.merchant)} title={t("new.tapReuse")} className="shrink-0 rounded-lg border overflow-hidden hover:border-primary transition-colors">
                      <img src={r.url} alt="" className="h-16 w-16 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0] ?? null); }}
              className={`mt-2 rounded-xl border-2 border-dashed p-4 text-center transition-all ${dragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/20 hover:border-primary/40 bg-muted/20"}`}>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">📸</div>
              <div className="mt-2 text-sm font-medium">{t("new.drop")}</div>
              <div className="text-xs text-muted-foreground">{t("new.dropHint")}</div>
              <Input type="file" accept="image/*,application/pdf" onChange={e=>onFile(e.target.files?.[0]??null)} className="mt-3" />
            </div>
            {file && (
              <div className="mt-3 rounded-xl border bg-card p-3 space-y-2 shadow-sm">
                <div className="flex items-start gap-3">
                  {file.type.startsWith("image/") && previewUrl && <img src={previewUrl} alt={t("new.receiptPreview")} className="h-20 w-20 rounded-lg object-cover border" />}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-medium">{file.name}</div>
                    <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB • {file.type || "file"}</div>
                    <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={()=>{ onFile(null); setOcr(null); }}>{t("new.removeFile")}</Button>
                  </div>
                </div>
                {ocr && (
                  <div className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white p-3 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">✨ {t("new.ocrTitle")}</div>
                    <div>{t("new.ocrMerchant", { name: ocr.merchant })}</div>
                    <div>{t("new.ocrAmount", { amount: formatMoney(Number(ocr.amount)) })}</div>
                    <div className="opacity-80">{t("new.ocrHint")}</div>
                  </div>
                )}
              </div>
            )}
          </div>
          {err && <div className="text-sm text-destructive">{err}</div>}
          <div className="flex justify-between"><Button type="button" variant="outline" onClick={()=>setStep(1)}>{t("new.back")}</Button><Button type="submit" disabled={mut.isPending}>{mut.isPending?t("new.submitting"):t("new.submit")}</Button></div>
        </form>
      )}
    </CardContent></Card>
  </div>;
}
