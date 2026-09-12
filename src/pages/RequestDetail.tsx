import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";

export default function RequestDetail(){
  const { id } = useParams();
  const { profile } = useSession();
  const isOwner = profile?.role==="owner";
  const qc=useQueryClient(); const { toast }=useToast();
  const [rejection,setRejection]=React.useState("");
  const [note,setNote]=React.useState("");
  const [receiptUrl,setReceiptUrl]=React.useState<string|null>(null);

  const { data, isLoading } = useQuery({ queryKey:["requests",id], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("*").eq("id",id!).single(); if(error) throw error; return data;
  }});

  React.useEffect(()=>{
    if(data?.receipt_url){
      supabase.storage.from("receipts").createSignedUrl(data.receipt_url, 60).then(({data})=> { if(data?.signedUrl) setReceiptUrl(data.signedUrl); });
    }
  },[data]);

  const approve = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.rpc("approve_request",{ p_request_id: id! });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); toast({title:"Approved"}); }, onError:(e:Error)=> toast({title:"Approve failed", description:e.message, variant:"destructive"}) });

  const reject = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.rpc("reject_request",{ p_request_id:id!, p_reason: rejection });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); toast({title:"Rejected"}); }, onError:(e:Error)=> toast({title:"Reject failed", description:e.message, variant:"destructive"}) });

  const reconcile = useMutation({ mutationFn: async()=>{
    const { error } = await supabase.rpc("reconcile_request",{ p_request_id:id!, p_note: note });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["requests"]}); toast({title:"Reconciled — ledger entry created"}); }, onError:(e:Error)=> toast({title:"Reconcile failed", description:e.message, variant:"destructive"}) });

  if(isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  if(!data) return <div className="p-4">Not found</div>;

  return <div className="space-y-6 max-w-2xl">
    <div className="flex justify-between items-start"><div><h1 className="text-2xl font-bold">{data.merchant ?? data.category}</h1><p className="text-sm text-muted-foreground">{data.description}</p></div><Badge variant={data.status as never}>{data.status}</Badge></div>
    <Card><CardHeader><CardTitle>Request</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3"><div><span className="text-muted-foreground">Amount</span><div className="font-medium">{formatMoney(Number(data.amount))}</div></div><div><span className="text-muted-foreground">Category</span><div>{data.category}</div></div></div>
      <div><span className="text-muted-foreground">Budget ID</span><div className="font-mono text-xs">{data.budget_id}</div></div>
      {data.rejection_reason && <div><span className="text-muted-foreground">Rejection reason</span><div>{data.rejection_reason}</div></div>}
      {receiptUrl ? <div><Label>Receipt</Label><a href={receiptUrl} target="_blank" rel="noreferrer" className="text-primary underline block">View receipt (signed URL, 60s)</a><img src={receiptUrl} alt="receipt" className="mt-2 max-h-64 rounded border" onError={e=> (e.currentTarget.style.display="none")} /></div> : data.receipt_url ? <div className="text-muted-foreground">Receipt stored: {data.receipt_url} (signing…)</div> : <div className="text-muted-foreground">No receipt</div>}
    </CardContent></Card>

    {isOwner && data.status==="pending" && <Card><CardHeader><CardTitle>Review (owner only)</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="flex gap-2"><Button onClick={()=>approve.mutate()} disabled={approve.isPending}>{approve.isPending?"Approving…":"Approve"}</Button><div className="flex-1 flex gap-2"><Textarea placeholder="Rejection reason (min 3 chars)" value={rejection} onChange={e=>setRejection(e.target.value)} /><Button variant="destructive" onClick={()=>reject.mutate()} disabled={reject.isPending || rejection.trim().length<3}>Reject</Button></div></div>
    </CardContent></Card>}

    {isOwner && data.status==="approved" && <Card><CardHeader><CardTitle>Reconcile (Xero-style)</CardTitle></CardHeader><CardContent className="space-y-3">
      <Label>Reconciliation note</Label><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Verified against bank feed…" />
      <Button onClick={()=>reconcile.mutate()} disabled={reconcile.isPending}>{reconcile.isPending?"Reconciling…":"Reconcile & create ledger entry"}</Button>
      <p className="text-xs text-muted-foreground">This creates an immutable ledger debit atomically via <code>reconcile_request()</code>. Only approved requests can be reconciled.</p>
    </CardContent></Card>}
  </div>;
}
