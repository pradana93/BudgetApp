import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatMoney, isValidMoney } from "@/lib/money";
import { formatDate, isOverdue } from "@/lib/datetime";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/i18n/LanguageContext";

const CATEGORIES = ["groceries", "transport", "dining", "utilities", "health", "other"];

export default function RequestDetail(){
  const { id } = useParams();
  const { profile } = useSession();
  const { t, lang } = useLang();
  const isOwner = profile?.role==="owner";
  const qc=useQueryClient(); const { toast }=useToast();
  const nav = useNavigate();
  const [rejection,setRejection]=React.useState("");
  const [note,setNote]=React.useState("");
  const [receiptUrl,setReceiptUrl]=React.useState<string|null>(null);
  const [editing,setEditing]=React.useState(false);
  const [editForm,setEditForm]=React.useState({ amount:"", category:"groceries", merchant:"", description:"", due_date:"" });
  const [editErr,setEditErr]=React.useState<string|null>(null);
  const [confirmDelete,setConfirmDelete]=React.useState(false);

  const { data, isLoading } = useQuery({ queryKey:["requests",id], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("*").eq("id",id!).single(); if(error) throw error; return data;
  }});

  React.useEffect(()=>{
    if(data?.receipt_url){
      supabase.storage.from("receipts").createSignedUrl(data.receipt_url, 60).then(({data})=> { if(data?.signedUrl) setReceiptUrl(data.signedUrl); });
    }
  },[data]);

  const isMine = !!profile && !!data && profile.id === data.requester_id;
  const canEdit = isMine && data?.status === "pending";
  const canDelete = (isMine && data?.status === "pending") || (isOwner && data?.status !== "reconciled");

  const approve = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.rpc("approve_request",{ p_request_id: id! });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); toast({title:t("rd.approved")}); }, onError:(e:Error)=> toast({title:t("rd.approveFailed"), description:e.message, variant:"destructive"}) });

  const reject = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.rpc("reject_request",{ p_request_id:id!, p_reason: rejection });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); toast({title:t("rd.rejected")}); }, onError:(e:Error)=> toast({title:t("rd.rejectFailed"), description:e.message, variant:"destructive"}) });

  const reconcile = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.rpc("reconcile_request",{ p_request_id:id!, p_note: note });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); toast({title:t("rd.reconciled")}); }, onError:(e:Error)=> toast({title:t("rd.reconcileFailed"), description:e.message, variant:"destructive"}) });

  const startEdit = ()=>{
    if(!data) return;
    setEditForm({ amount: String(data.amount), category: data.category, merchant: data.merchant ?? "", description: data.description ?? "", due_date: data.due_date ?? "" });
    setEditErr(null);
    setEditing(true);
  };

  const saveEdit = useMutation({ mutationFn: async()=>{
    const amt = editForm.amount.trim();
    if (!isValidMoney(amt) || !(Number(amt) > 0)) throw new Error(t("v.amountGt"));
    const { error } = await supabase.from("reimbursement_requests").update({
      amount: Number(amt), category: editForm.category,
      merchant: editForm.merchant.trim() || null, description: editForm.description.trim() || null,
      due_date: editForm.due_date || null,
    }).eq("id", id!);
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); setEditing(false); toast({title:t("rd.updated")}); }, onError:(e:Error)=> setEditErr(e.message) });

  const del = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.from("reimbursement_requests").delete().eq("id", id!);
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); toast({title:t("rd.deleted")}); nav("/requests"); }, onError:(e:Error)=> toast({title:t("rd.deleteFailed"), description:e.message, variant:"destructive"}) });

  if(isLoading) return <div className="p-4 text-sm text-muted-foreground">{t("common.loading")}</div>;
  if(!data) return <div className="p-4">{t("rd.notFound")}</div>;

  return <div className="space-y-6 max-w-2xl">
    <div className="flex justify-between items-start"><div><h1 className="text-2xl font-bold">{data.merchant ?? data.category}</h1><p className="text-sm text-muted-foreground">{data.description}</p></div><Badge variant={data.status as never}>{data.status}</Badge></div>
    <Card><CardHeader><CardTitle>{t("rd.request")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3"><div><span className="text-muted-foreground">{t("rd.amount")}</span><div className="font-medium">{formatMoney(Number(data.amount))}</div></div><div><span className="text-muted-foreground">{t("rd.category")}</span><div>{data.category}</div></div></div>
      <div><span className="text-muted-foreground">{t("rd.budgetId")}</span><div className="font-mono text-xs">{data.budget_id}</div></div>
      <div><span className="text-muted-foreground">{t("rd.dueDate")}</span><div className={isOverdue(data.due_date, data.status) ? "text-destructive font-medium" : undefined}>{data.due_date ? <>{formatDate(data.due_date, lang)}{isOverdue(data.due_date, data.status) && <Badge variant="destructive" className="ml-2">{t("rd.overdue")}</Badge>}</> : t("rd.noDue")}</div></div>
      {data.rejection_reason && <div><span className="text-muted-foreground">{t("rd.rejectReason")}</span><div>{data.rejection_reason}</div></div>}
      {receiptUrl ? <div><Label>{t("rd.receipt")}</Label><a href={receiptUrl} target="_blank" rel="noreferrer" className="text-primary underline block">{t("rd.viewReceipt")}</a><img src={receiptUrl} alt="receipt" className="mt-2 max-h-64 rounded border" onError={e=> (e.currentTarget.style.display="none")} /></div> : data.receipt_url ? <div className="text-muted-foreground">{t("rd.receiptSigning", { path: data.receipt_url })}</div> : <div className="text-muted-foreground">{t("rd.noReceipt")}</div>}
    </CardContent></Card>

    {canEdit && !editing && <div><Button variant="outline" onClick={startEdit}>{t("rd.edit")}</Button></div>}

    {canEdit && editing && <Card><CardHeader><CardTitle>{t("rd.editTitle")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <div><Label>{t("new.amount")}</Label><Input value={editForm.amount} onChange={e=>setEditForm({...editForm,amount:e.target.value})} /></div>
      <div><Label>{t("new.category")}</Label><Select value={editForm.category} onChange={e=>setEditForm({...editForm,category:e.target.value})}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</Select></div>
      <div><Label>{t("new.merchant")}</Label><Input value={editForm.merchant} onChange={e=>setEditForm({...editForm,merchant:e.target.value})} /></div>
      <div><Label>{t("new.description")}</Label><Textarea value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})} /></div>
      <div><Label>{t("new.dueDate")}</Label><Input type="date" value={editForm.due_date} onChange={e=>setEditForm({...editForm,due_date:e.target.value})} /></div>
      {editErr && <div className="text-sm text-destructive">{editErr}</div>}
      <div className="flex gap-2"><Button onClick={()=>saveEdit.mutate()} disabled={saveEdit.isPending}>{saveEdit.isPending?t("rd.saving"):t("rd.save")}</Button><Button variant="outline" onClick={()=>setEditing(false)}>{t("common.cancel")}</Button></div>
    </CardContent></Card>}

    {isOwner && data.status==="pending" && <Card><CardHeader><CardTitle>{t("rd.review")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="flex gap-2"><Button onClick={()=>approve.mutate()} disabled={approve.isPending}>{approve.isPending?t("rd.approving"):t("rd.approve")}</Button><div className="flex-1 flex gap-2"><Textarea placeholder={t("rd.rejectPh")} value={rejection} onChange={e=>setRejection(e.target.value)} /><Button variant="destructive" onClick={()=>reject.mutate()} disabled={reject.isPending || rejection.trim().length<3}>{t("rd.reject")}</Button></div></div>
    </CardContent></Card>}

    {isOwner && data.status==="approved" && <Card><CardHeader><CardTitle>{t("rd.reconcileTitle")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <Label>{t("rd.reconcileNote")}</Label><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={t("rd.reconcilePh")} />
      <Button onClick={()=>reconcile.mutate()} disabled={reconcile.isPending}>{reconcile.isPending?t("rd.reconciling"):t("rd.reconcileBtn")}</Button>
      <p className="text-xs text-muted-foreground">{t("rd.reconcileHelpA")} <code>reconcile_request()</code>. {t("rd.reconcileHelpB")}</p>
    </CardContent></Card>}

    {canDelete && !editing && <div>
      {!confirmDelete
        ? <Button variant="destructive" onClick={()=>setConfirmDelete(true)}>{t("rd.delete")}</Button>
        : <div className="flex items-center gap-2"><span className="text-sm">{t("rd.deleteConfirm")}</span><Button variant="destructive" onClick={()=>del.mutate()} disabled={del.isPending}>{del.isPending?t("rd.deleting"):t("rd.deleteYes")}</Button><Button variant="outline" onClick={()=>setConfirmDelete(false)}>{t("common.cancel")}</Button></div>}
    </div>}
  </div>;
}
