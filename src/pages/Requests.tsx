import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { formatMoney } from "@/lib/money";
import { useRealtime } from "@/hooks/useRealtime";

const STATUSES = ["all", "pending", "approved", "rejected", "reconciled"] as const;
const CATEGORIES = ["all", "groceries", "transport", "dining", "utilities", "health", "other"] as const;

export default function Requests(){
  useRealtime();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<(typeof STATUSES)[number]>("all");
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>("all");

  const { data, isLoading } = useQuery({ queryKey:["requests"], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("*").order("created_at",{ascending:false}); if(error) throw error; return data;
  }});

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (category !== "all" && r.category !== category) return false;
      if (needle && !`${r.merchant ?? ""} ${r.description ?? ""} ${r.category}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, q, status, category]);

  return <div className="space-y-4">
    <div className="flex justify-between items-center"><h1 className="text-2xl font-bold">Reimbursement Requests</h1><Link to="/requests/new"><Button>New request</Button></Link></div>
    <Card><CardHeader><CardTitle>All requests</CardTitle></CardHeader><CardContent>
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="Search merchant or note…" value={q} onChange={(e)=>setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e)=>setStatus(e.target.value as typeof status)} aria-label="Filter by status">
          {STATUSES.map((s)=><option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </Select>
        <Select value={category} onChange={(e)=>setCategory(e.target.value as typeof category)} aria-label="Filter by category">
          {CATEGORIES.map((c)=><option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
        </Select>
        {(q || status !== "all" || category !== "all") && (
          <Button variant="outline" onClick={()=>{ setQ(""); setStatus("all"); setCategory("all"); }}>Clear</Button>
        )}
      </div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
      <Table><TableHeader><TableRow><TableHead>Merchant</TableHead><TableHead>Category</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
      <TableBody>{filtered?.map(r=> <TableRow key={r.id}><TableCell><Link to={`/requests/${r.id}`} className="text-primary underline">{r.merchant ?? "—"}</Link></TableCell><TableCell>{r.category}</TableCell><TableCell>{formatMoney(Number(r.amount))}</TableCell><TableCell><Badge variant={r.status as never}>{r.status}</Badge></TableCell><TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell></TableRow>)}
      {filtered?.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{(data?.length ?? 0) === 0 ? "No requests — submit one" : "No requests match these filters"}</TableCell></TableRow>}
      </TableBody></Table>}
    </CardContent></Card>
  </div>;
}
