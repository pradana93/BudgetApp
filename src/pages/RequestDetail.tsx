import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { formatDate, isOverdue, timeAgo } from "@/lib/datetime";
import { approvalRisk, findDuplicates } from "@/lib/advisor";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/i18n/LanguageContext";
import { useCategories } from "@/hooks/useCategories";

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
  const [confirmUndo,setConfirmUndo]=React.useState(false);
  const [commentBody,setCommentBody]=React.useState("");
  const { categories } = useCategories();

  const { data, isLoading } = useQuery({ queryKey:["requests",id], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("*").eq("id",id!).single(); if(error) throw error; return data;
  }});

  const { data: budget } = useQuery({
    queryKey: ["budget-for-risk", data?.budget_id],
    queryFn: async () => {
      const { data: b, error } = await supabase.from("budgets").select("total_amount,allocated_amount,available_amount,currency").eq("id", data!.budget_id).single();
      if (error) throw error;
      return b;
    },
    enabled: !!data,
  });

  const { data: siblings } = useQuery({
    queryKey: ["budget-requests", data?.budget_id],
    queryFn: async () => {
      const { data: list, error } = await supabase.from("reimbursement_requests").select("id,merchant,amount,category,status,created_at").eq("budget_id", data!.budget_id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (list ?? []) as { id: string; merchant: string | null; amount: number; category: string; status: string; created_at: string }[];
    },
    enabled: !!data,
  });

  React.useEffect(()=>{
    if(data?.receipt_url){
      supabase.storage.from("receipts").createSignedUrl(data.receipt_url, 60).then(({data})=> { if(data?.signedUrl) setReceiptUrl(data.signedUrl); });
    }
  },[data]);

  const isMine = !!profile && !!data && profile.id === data.requester_id;
  const canEdit = isMine && data?.status === "pending";
  const canDelete = (isMine && data?.status === "pending") || (isOwner && data?.status !== "reconciled");

  const risk = data
    ? approvalRisk(
        { merchant: data.merchant, amount: data.amount, category: data.category, status: data.status, created_at: data.created_at, receipt_url: data.receipt_url },
        budget ? { available_amount: budget.available_amount, total_amount: budget.total_amount } : null,
        siblings ?? [],
        lang
      )
    : null;
  const dups = data
    ? findDuplicates(
        { id: data.id, merchant: data.merchant, amount: data.amount, category: data.category, status: data.status, created_at: data.created_at },
        siblings ?? []
      )
    : [];
  const riskVariant = risk?.level === "risky" ? "destructive" : risk?.level === "review" ? "pending" : "approved";
  const riskLabel = risk?.level === "risky" ? t("risk.risky") : risk?.level === "review" ? t("risk.review") : t("risk.safe");

  const approve = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.rpc("approve_request",{ p_request_id: id! });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); toast({title:t("rd.approved"), action:{ label: t("rd.viewBudget"), onClick: ()=>nav(`/budgets/${data?.budget_id}`) }}); }, onError:(e:Error)=> toast({title:t("rd.approveFailed"), description:e.message, variant:"destructive"}) });

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

  type Comment = { id: string; author_id: string; body: string; created_at: string };
  const { data: comments } = useQuery({
    queryKey: ["comments", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("request_comments").select("*").eq("request_id", id!).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Comment[];
    },
  });

  React.useEffect(() => {
    const ch = supabase.channel(`comments-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_comments" }, () => {
        qc.invalidateQueries({ queryKey: ["comments", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, id]);

  const sendComment = useMutation({
    mutationFn: async () => {
      const body = commentBody.trim();
      if (!body || !profile) throw new Error("empty");
      const { error } = await supabase.from("request_comments").insert({ request_id: id!, author_id: profile.id, body: body.slice(0, 1000) });
      if (error) throw error;
    },
    onSuccess: () => { setCommentBody(""); qc.invalidateQueries({ queryKey: ["comments", id] }); },
    onError: (e: Error) => { if (e.message !== "empty") toast({ title: t("new.failed"), description: e.message, variant: "destructive" }); },
  });

  const unapprove = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.rpc("unapprove_request",{ p_request_id: id! });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); qc.invalidateQueries({queryKey:["budgets"]}); setConfirmUndo(false); toast({title:t("rd.approvalCanceled")}); }, onError:(e:Error)=> toast({title:t("rd.cancelFailed"), description:e.message, variant:"destructive"}) });

  const unreconcile = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.rpc("unreconcile_request",{ p_request_id: id! });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); qc.invalidateQueries({queryKey:["admin-ledger"]}); setConfirmUndo(false); toast({title:t("rd.reconCanceled")}); }, onError:(e:Error)=> toast({title:t("rd.cancelFailed"), description:e.message, variant:"destructive"}) });

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

    {risk && (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base">{t("risk.title")} <Badge variant={riskVariant}>{riskLabel} {risk.score}</Badge></CardTitle></CardHeader>
        <CardContent>
          <div className="h-1.5 rounded bg-muted overflow-hidden mb-2"><div className={`h-1.5 rounded ${risk.level === "risky" ? "bg-destructive" : risk.level === "review" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${risk.score}%` }} /></div>
          <ul className="text-sm text-muted-foreground space-y-0.5">{risk.reasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>
        </CardContent>
      </Card>
    )}

    {dups.length > 0 && (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm space-y-1">
        <div className="font-semibold">{t("dup.title")}</div>
        <div className="text-muted-foreground">{t("dup.desc", { n: dups.length })}</div>
        {dups.slice(0, 3).map((d) => (
          <div key={d.id}><Link to={`/requests/${d.id}`} className="text-primary underline">{d.merchant ?? d.category} — {formatMoney(Number(d.amount))}</Link></div>
        ))}
      </div>
    )}

    {canEdit && !editing && <div><Button variant="outline" onClick={startEdit}>{t("rd.edit")}</Button></div>}

    {canEdit && editing && <Card><CardHeader><CardTitle>{t("rd.editTitle")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <div><Label>{t("new.amount")}</Label><Input value={editForm.amount} onChange={e=>setEditForm({...editForm,amount:e.target.value})} /></div>
      <div><Label>{t("new.category")}</Label><Select value={editForm.category} onChange={e=>setEditForm({...editForm,category:e.target.value})}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</Select></div>
      <div><Label>{t("new.merchant")}</Label><Input value={editForm.merchant} onChange={e=>setEditForm({...editForm,merchant:e.target.value})} /></div>
      <div><Label>{t("new.description")}</Label><Textarea value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})} /></div>
      <div><Label>{t("new.dueDate")}</Label><Input type="date" value={editForm.due_date} onChange={e=>setEditForm({...editForm,due_date:e.target.value})} /></div>
      {editErr && <div className="text-sm text-destructive">{editErr}</div>}
      <div className="flex gap-2"><Button onClick={()=>saveEdit.mutate()} disabled={saveEdit.isPending}>{saveEdit.isPending?t("rd.saving"):t("rd.save")}</Button><Button variant="outline" onClick={()=>setEditing(false)}>{t("common.cancel")}</Button></div>
    </CardContent></Card>}

    {isOwner && data.status==="pending" && <Card><CardHeader><CardTitle>{t("rd.review")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2"><Button onClick={()=>approve.mutate()} disabled={approve.isPending}>{approve.isPending?t("rd.approving"):t("rd.approve")}</Button><div className="flex-1 flex flex-col sm:flex-row gap-2"><Textarea placeholder={t("rd.rejectPh")} value={rejection} onChange={e=>setRejection(e.target.value)} /><Button variant="destructive" onClick={()=>reject.mutate()} disabled={reject.isPending || rejection.trim().length<3}>{t("rd.reject")}</Button></div></div>
    </CardContent></Card>}

    {isOwner && data.status==="approved" && <Card><CardHeader><CardTitle>{t("rd.reconcileTitle")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <Label>{t("rd.reconcileNote")}</Label><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={t("rd.reconcilePh")} />
      <Button onClick={()=>reconcile.mutate()} disabled={reconcile.isPending}>{reconcile.isPending?t("rd.reconciling"):t("rd.reconcileBtn")}</Button>
      <p className="text-xs text-muted-foreground">{t("rd.reconcileHelpA")} <code>reconcile_request()</code>. {t("rd.reconcileHelpB")}</p>
      <div className="pt-1 border-t">
        {!confirmUndo
          ? <Button variant="outline" onClick={()=>setConfirmUndo(true)}>{t("rd.cancelApproval")}</Button>
          : <div className="flex flex-col sm:flex-row sm:items-center gap-2"><span className="text-sm">{t("rd.confirmCancel")}</span><span className="flex gap-2"><Button variant="destructive" size="sm" onClick={()=>unapprove.mutate()} disabled={unapprove.isPending}>{unapprove.isPending?t("rd.canceling"):t("rd.yesCancel")}</Button><Button variant="outline" size="sm" onClick={()=>setConfirmUndo(false)}>{t("common.cancel")}</Button></span></div>}
      </div>
    </CardContent></Card>}

    {isOwner && data.status==="reconciled" && <Card><CardHeader><CardTitle>{t("rd.cancelRecon")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("rd.confirmCancel")}</p>
      {!confirmUndo
        ? <Button variant="destructive" onClick={()=>setConfirmUndo(true)}>{t("rd.cancelRecon")}</Button>
        : <div className="flex gap-2"><Button variant="destructive" onClick={()=>unreconcile.mutate()} disabled={unreconcile.isPending}>{unreconcile.isPending?t("rd.canceling"):t("rd.yesCancel")}</Button><Button variant="outline" onClick={()=>setConfirmUndo(false)}>{t("common.cancel")}</Button></div>}
    </CardContent></Card>}

    {canDelete && !editing && <div>
      {!confirmDelete
        ? <Button variant="destructive" onClick={()=>setConfirmDelete(true)}>{t("rd.delete")}</Button>
        : <div className="flex items-center gap-2"><span className="text-sm">{t("rd.deleteConfirm")}</span><Button variant="destructive" onClick={()=>del.mutate()} disabled={del.isPending}>{del.isPending?t("rd.deleting"):t("rd.deleteYes")}</Button><Button variant="outline" onClick={()=>setConfirmDelete(false)}>{t("common.cancel")}</Button></div>}
    </div>}

    <Card><CardHeader><CardTitle>{t("rd.comments")} {(comments?.length ?? 0) > 0 && <Badge variant="secondary" className="ml-1">{comments?.length}</Badge>}</CardTitle></CardHeader><CardContent className="space-y-3">
      {(comments?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground">{t("rd.noComments")}</div>}
      {comments?.map((c) => (
        <div key={c.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${c.author_id === profile?.id ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>
          <div>{c.body}</div>
          <div className={`mt-0.5 text-[11px] ${c.author_id === profile?.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {c.author_id === profile?.id ? t("reward.you") : ""} {c.author_id === profile?.id ? "•" : ""} {timeAgo(c.created_at, lang)}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={commentBody} onChange={(e)=>setCommentBody(e.target.value)} placeholder={t("rd.commentPh")} maxLength={1000}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment.mutate(); } }} />
        <Button onClick={()=>sendComment.mutate()} disabled={sendComment.isPending || commentBody.trim().length === 0}>{sendComment.isPending ? t("rd.sending") : t("rd.send")}</Button>
      </div>
    </CardContent></Card>
  </div>;
}
