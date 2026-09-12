import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { Link } from "react-router-dom";
import { useRealtime } from "@/hooks/useRealtime";
import { z } from "zod";
import { budgetSchema } from "@/schemas/budget";

export default function Budgets(){
  useRealtime();
  const { profile } = useSession();
  const isOwner = profile?.role==="owner";
  const qc=useQueryClient(); const { toast }=useToast();
  const [open,setOpen]=React.useState(false);
  const [form,setForm]=React.useState({ name:"", total_amount:"", currency:"IDR", period_start:"", period_end:"" });
  const [err,setErr]=React.useState<string|null>(null);

  const { data, isLoading } = useQuery({ queryKey:["budgets"], queryFn: async()=>{
    const { data, error } = await supabase.from("budgets").select("*").order("created_at",{ascending:false}); if(error) throw error; return data;
  }});
  const mut = useMutation({ mutationFn: async()=>{
    const parsed = budgetSchema.parse({ ...form });
    const { error } = await supabase.from("budgets").insert({ name: parsed.name, total_amount: Number(parsed.total_amount), currency: parsed.currency ?? "IDR", period_start: parsed.period_start || null, period_end: parsed.period_end || null, owner_id: profile!.id });
    if(error) throw error;
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["budgets"]}); setOpen(false); setForm({ name:"", total_amount:"", currency:"IDR", period_start:"", period_end:"" }); toast({title:"Budget created"}); }, onError:(e:Error)=> toast({title:"Failed", description:e.message, variant:"destructive"}) });

  const statusMut = useMutation({ mutationFn: async({ id, status }: { id: string; status: "active" | "closed" })=>{
    const { error } = await supabase.from("budgets").update({ status }).eq("id", id);
    if(error) throw error;
  }, onSuccess:(_, v)=>{ qc.invalidateQueries({queryKey:["budgets"]}); toast({title: v.status === "closed" ? "Budget closed" : "Budget reopened"}); }, onError:(e:Error)=> toast({title:"Failed", description:e.message, variant:"destructive"}) });

  const usagePct = (b: { total_amount: number | string; allocated_amount: number | string }) => {
    const total = Number(b.total_amount);
    if (!(total > 0)) return 0;
    return Math.min(100, Math.max(0, (Number(b.allocated_amount) / total) * 100));
  };

  const onCreate = ()=>{ try{ setErr(null); budgetSchema.parse({...form}); mut.mutate(); } catch(e){ if(e instanceof z.ZodError) setErr(e.errors[0].message); else setErr((e as Error).message); } };

  return <div className="space-y-4">
    <div className="flex justify-between items-center"><h1 className="text-2xl font-bold">Budgets</h1>{isOwner && <Button onClick={()=>setOpen(true)}>New budget</Button>}</div>
    <Card><CardHeader><CardTitle>All budgets</CardTitle></CardHeader><CardContent>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
      <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Total</TableHead><TableHead>Allocated</TableHead><TableHead>Available</TableHead><TableHead>Usage</TableHead><TableHead>Status</TableHead>{isOwner && <TableHead>Action</TableHead>}</TableRow></TableHeader>
      <TableBody>{data?.map(b=> <TableRow key={b.id}><TableCell><Link to={`/budgets/${b.id}`} className="text-primary underline">{b.name}</Link></TableCell><TableCell>{formatMoney(Number(b.total_amount), b.currency)}</TableCell><TableCell>{formatMoney(Number(b.allocated_amount), b.currency)}</TableCell><TableCell>{formatMoney(Number(b.available_amount), b.currency)}</TableCell><TableCell><div className="h-2 w-28 rounded bg-muted overflow-hidden" title={`${usagePct(b).toFixed(1)}% used`}><div className="h-2 rounded bg-primary" style={{ width: `${usagePct(b)}%` }} /></div></TableCell><TableCell><Badge variant={b.status==="active"?"approved":"secondary"}>{b.status}</Badge></TableCell>{isOwner && <TableCell>{b.status === "active"
        ? <Button size="sm" variant="outline" onClick={()=>statusMut.mutate({ id: b.id, status: "closed" })} disabled={statusMut.isPending}>Close</Button>
        : <Button size="sm" variant="outline" onClick={()=>statusMut.mutate({ id: b.id, status: "active" })} disabled={statusMut.isPending}>Reopen</Button>}</TableCell>}</TableRow>)}
      {data?.length===0 && <TableRow><TableCell colSpan={isOwner ? 7 : 6} className="text-center text-muted-foreground">No budgets yet</TableCell></TableRow>}
      </TableBody></Table>}
    </CardContent></Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader><DialogTitle>New budget</DialogTitle></DialogHeader>
      <DialogContent>
        <div className="grid gap-3">
          <div><Label>Name</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Household Nov 2025" /></div>
          <div><Label>Total amount (IDR)</Label><Input value={form.total_amount} onChange={e=>setForm({...form,total_amount:e.target.value})} placeholder="5000000" /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Start</Label><Input type="date" value={form.period_start} onChange={e=>setForm({...form,period_start:e.target.value})} /></div><div><Label>End</Label><Input type="date" value={form.period_end} onChange={e=>setForm({...form,period_end:e.target.value})} /></div></div>
          {err && <div className="text-sm text-destructive">{err}</div>}
        </div>
      </DialogContent>
      <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={onCreate} disabled={mut.isPending}>{mut.isPending?"Creating…":"Create"}</Button></DialogFooter>
    </Dialog>
  </div>;
}
