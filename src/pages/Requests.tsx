import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { formatMoney } from "@/lib/money";
import { useRealtime } from "@/hooks/useRealtime";

export default function Requests(){
  useRealtime();
  const { data, isLoading } = useQuery({ queryKey:["requests"], queryFn: async()=>{
    const { data, error } = await supabase.from("reimbursement_requests").select("*").order("created_at",{ascending:false}); if(error) throw error; return data;
  }});
  return <div className="space-y-4">
    <div className="flex justify-between items-center"><h1 className="text-2xl font-bold">Reimbursement Requests</h1><Link to="/requests/new"><Button>New request</Button></Link></div>
    <Card><CardHeader><CardTitle>All requests</CardTitle></CardHeader><CardContent>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
      <Table><TableHeader><TableRow><TableHead>Merchant</TableHead><TableHead>Category</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
      <TableBody>{data?.map(r=> <TableRow key={r.id}><TableCell><Link to={`/requests/${r.id}`} className="text-primary underline">{r.merchant ?? "—"}</Link></TableCell><TableCell>{r.category}</TableCell><TableCell>{formatMoney(Number(r.amount))}</TableCell><TableCell><Badge variant={r.status as never}>{r.status}</Badge></TableCell><TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell></TableRow>)}
      {data?.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No requests — submit one</TableCell></TableRow>}
      </TableBody></Table>}
    </CardContent></Card>
  </div>;
}
