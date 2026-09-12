import { useSession } from "@/hooks/useSession";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

export default function Settings(){
  const { profile, session } = useSession();
  return <div className="space-y-6 max-w-xl">
    <h1 className="text-2xl font-bold">Settings</h1>
    <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      <div>Email: <span className="font-medium">{profile?.email ?? session?.user.email}</span> <Badge className="ml-2 capitalize">{profile?.role}</Badge></div>
      <div>User ID: <span className="font-mono text-xs">{profile?.id ?? session?.user.id}</span></div>
      <div>Currency default: IDR (configurable per budget)</div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Storage</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">
      Receipts bucket <code>receipts</code> is private; access via signed URLs only. Path <code>{"{user_id}/{request_id}/{filename}"}</code>.
    </CardContent></Card>
    <Button variant="destructive" onClick={()=>supabase.auth.signOut()}>Sign out</Button>
  </div>;
}
