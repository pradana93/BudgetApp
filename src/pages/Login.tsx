import * as React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/hooks/useSession";

export default function Login(){
  const [email,setEmail]=React.useState("owner@budgetapp.local");
  const [password,setPassword]=React.useState("password123");
  const [loading,setLoading]=React.useState(false);
  const { toast } = useToast();
  const nav=useNavigate();
  const { session } = useSession();
  React.useEffect(()=>{ if(session) nav("/",{replace:true}); },[session,nav]);

  const onSubmit = async (e:React.FormEvent)=>{
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if(error) toast({ title:"Login failed", description: error.message, variant:"destructive" });
    else { toast({ title:"Signed in", description: email }); nav("/"); }
  };

  const signUp = async ()=>{
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if(error) toast({ title:"Sign up failed", description:error.message, variant:"destructive" });
    else toast({ title:"Check email", description:"Account created — you can now sign in" });
  };

  return <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>BudgetApp Login</CardTitle><CardDescription>Email + password (owner/member). Supabase Auth.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div><Label>Email</Label><Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="owner@budgetapp.local" /></div>
          <div><Label>Password</Label><Input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={loading}>{loading?"Signing in…":"Sign in"}</Button>
          <Button type="button" variant="outline" className="w-full" onClick={signUp} disabled={loading}>Create account (sign up)</Button>
          <p className="text-xs text-muted-foreground">Seed accounts: <b>owner@budgetapp.local</b> / <b>member@budgetapp.local</b> — password you set. See docs/REPORT.md for invite flow.</p>
        </form>
      </CardContent>
    </Card>
  </div>;
}
