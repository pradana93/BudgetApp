import * as React from "react";
import { useSession } from "@/hooks/useSession";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

export default function Settings(){
  const { profile, session } = useSession();
  const { toast } = useToast();
  const [displayName, setDisplayName] = React.useState(profile?.display_name ?? "");
  const [savingName, setSavingName] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [savingPw, setSavingPw] = React.useState(false);

  React.useEffect(() => { setDisplayName(profile?.display_name ?? ""); }, [profile?.display_name]);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!profile || name.length === 0 || name.length > 100) {
      toast({ title: "Invalid name", description: "Name must be 1–100 characters", variant: "destructive" });
      return;
    }
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", profile.id);
    setSavingName(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Profile updated" });
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Invalid password", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPw(false);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else { setNewPassword(""); toast({ title: "Password updated" }); }
  };

  return <div className="space-y-6 max-w-xl">
    <h1 className="text-2xl font-bold">Settings</h1>
    <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      <div>Email: <span className="font-medium">{profile?.email ?? session?.user.email}</span> <Badge className="ml-2 capitalize">{profile?.role}</Badge></div>
      <div>User ID: <span className="font-mono text-xs">{profile?.id ?? session?.user.id}</span></div>
      <div>Currency default: IDR (configurable per budget)</div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Display name</CardTitle><CardDescription>Shown across the app. 1–100 characters.</CardDescription></CardHeader><CardContent>
      <form onSubmit={saveName} className="flex gap-2">
        <Input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder="Your name" maxLength={100} />
        <Button type="submit" disabled={savingName}>{savingName ? "Saving…" : "Save"}</Button>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Change password</CardTitle><CardDescription>Minimum 8 characters.</CardDescription></CardHeader><CardContent>
      <form onSubmit={savePassword} className="flex gap-2">
        <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} placeholder="New password" />
        <Button type="submit" disabled={savingPw}>{savingPw ? "Updating…" : "Update"}</Button>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Storage</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">
      Receipts bucket <code>receipts</code> is private; access via signed URLs only. Path <code>{"{user_id}/{request_id}/{filename}"}</code>.
    </CardContent></Card>
    <Button variant="destructive" onClick={()=>supabase.auth.signOut()}>Sign out</Button>
  </div>;
}
