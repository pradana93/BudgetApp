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
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/i18n/LanguageContext";
import { useCategories } from "@/hooks/useCategories";
import { getRequestSchema } from "@/schemas/budget";
import { z } from "zod";

export default function NewRequest(){
  const { profile } = useSession();
  const { toast } = useToast();
  const { t } = useLang();
  const nav = useNavigate();
  const [form,setForm]=React.useState({ budget_id:"", amount:"", category:"groceries" as string, merchant:"", description:"", due_date:"" });
  const [file,setFile]=React.useState<File|null>(null);
  const [err,setErr]=React.useState<string|null>(null);

  const schema = React.useMemo(
    () => getRequestSchema({ budgetRequired: t("v.budgetRequired"), amountGt: t("v.amountGt"), categoryRequired: t("v.categoryRequired") }),
    [t]
  );
  const { categories } = useCategories();

  React.useEffect(() => {
    if (!categories.includes(form.category)) setForm((f) => ({ ...f, category: categories[0] ?? f.category }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const { data: budgets } = useQuery({ queryKey:["budgets"], queryFn: async()=>{
    const { data, error } = await supabase.from("budgets").select("id,name").eq("status","active"); if(error) throw error; return data;
  }});

  const mut = useMutation({ mutationFn: async()=>{
    const parsed = schema.parse(form);
    // create request first to get id
    const { data, error } = await supabase.from("reimbursement_requests").insert({
      budget_id: parsed.budget_id, requester_id: profile!.id, amount: Number(parsed.amount), category: parsed.category, merchant: parsed.merchant||null, description: parsed.description||null, due_date: parsed.due_date || null
    }).select().single();
    if(error) throw error;
    // upload receipt if present
    if(file && data){
      const path = `${profile!.id}/${data.id}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file);
      if(upErr) throw upErr;
      const { error: updErr } = await supabase.from("reimbursement_requests").update({ receipt_url: path }).eq("id", data.id);
      if(updErr) throw updErr;
    }
    return data;
  }, onSuccess:()=>{ toast({title:t("new.submitted")}); nav("/requests"); }, onError:(e:Error)=> toast({title:t("new.failed"), description:e.message, variant:"destructive"}) });

  const onSubmit = (e:React.FormEvent)=>{
    e.preventDefault();
    try{ setErr(null); schema.parse(form); mut.mutate(); } catch(ex){ if(ex instanceof z.ZodError) setErr(ex.errors[0].message); else setErr((ex as Error).message); }
  };

  return <div className="max-w-xl">
    <h1 className="text-2xl font-bold mb-4">{t("new.title")}</h1>
    <Card><CardHeader><CardTitle>{t("new.details")}</CardTitle></CardHeader><CardContent>
      <form onSubmit={onSubmit} className="space-y-4">
        <div><Label>{t("new.budget")}</Label><Select value={form.budget_id} onChange={e=>setForm({...form,budget_id:e.target.value})} required><option value="">{t("new.selectBudget")}</option>{budgets?.map(b=> <option key={b.id} value={b.id}>{b.name}</option>)}</Select></div>
        <div><Label>{t("new.amount")}</Label><Input value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder={t("new.amountPh")} required /></div>
        <div><Label>{t("new.category")}</Label><Select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map((c)=><option key={c} value={c}>{c}</option>)}</Select></div>
        <div><Label>{t("new.merchant")}</Label><Input value={form.merchant} onChange={e=>setForm({...form,merchant:e.target.value})} placeholder={t("new.merchantPh")} /></div>
        <div><Label>{t("new.description")}</Label><Textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder={t("new.descPh")} /></div>
        <div><Label>{t("new.dueDate")}</Label><Input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} /></div>
        <div><Label>{t("new.receipt")}</Label><Input type="file" accept="image/*,application/pdf" onChange={e=>setFile(e.target.files?.[0]??null)} /></div>
        {err && <div className="text-sm text-destructive">{err}</div>}
        <Button type="submit" disabled={mut.isPending} className="w-full">{mut.isPending?t("new.submitting"):t("new.submit")}</Button>
      </form>
    </CardContent></Card>
  </div>;
}
