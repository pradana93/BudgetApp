import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

export default function BudgetDetail(){
  const { id } = useParams();
  const { data: budget } = useQuery({ queryKey:["budgets",id], queryFn: async()=>{
    const { data, error } = await supabase.from("budgets").select("*").eq("id",id!).single(); if(error) throw error; return data;
  }});
  const { data: ledger } = useQuery({ queryKey:["ledger",id], queryFn: async()=>{
    const { data, error } = await supabase.from("ledger_entries").select("*").eq("budget_id",id!).order("created_at",{ascending:true}); if(error) throw error; return data;
  }});
  const { data: requests } = useQuery({ queryKey:["requests",id], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("*").eq("budget_id",id!).order("created_at",{ascending:false}); if(error) throw error; return data;
  }});

  const exportCsv = ()=>{
    if(!ledger) return;
    const rows = [["date","type","debit","credit","description"], ...ledger.map(l=>[l.created_at, l.reference_type, String(l.debit), String(l.credit), (l.description??"").replace(/,/g," ")])];
    const csv = rows.map(r=>r.join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`reconciliation-${id}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if(!budget) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  return <div className="space-y-6">
    <div className="flex justify-between"><div><h1 className="text-2xl font-bold">{budget.name}</h1><p className="text-sm text-muted-foreground">{formatMoney(Number(budget.total_amount),budget.currency)} total • {formatMoney(Number(budget.allocated_amount),budget.currency)} allocated • {formatMoney(Number(budget.available_amount),budget.currency)} available</p></div><Button variant="outline" onClick={exportCsv}>Export CSV</Button></div>
    <Card><CardHeader><CardTitle>Ledger (append-only)</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Debit</TableHead><TableHead>Credit</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
      <TableBody>{ledger?.map(l=> <TableRow key={l.id}><TableCell>{new Date(l.created_at).toLocaleString()}</TableCell><TableCell>{l.reference_type}</TableCell><TableCell>{l.debit>0?formatMoney(Number(l.debit),budget.currency):"-"}</TableCell><TableCell>{l.credit>0?formatMoney(Number(l.credit),budget.currency):"-"}</TableCell><TableCell>{l.description}</TableCell></TableRow>)}
      {ledger?.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No ledger entries — reconcile approved requests to generate entries</TableCell></TableRow>}
      </TableBody></Table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Requests in this budget</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Merchant</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
      <TableBody>{requests?.map(r=> <TableRow key={r.id}><TableCell>{r.merchant ?? r.category}</TableCell><TableCell>{formatMoney(Number(r.amount),budget.currency)}</TableCell><TableCell>{r.status}</TableCell><TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell></TableRow>)}
      {requests?.length===0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No requests</TableCell></TableRow>}
      </TableBody></Table>
    </CardContent></Card>
  </div>;
}
