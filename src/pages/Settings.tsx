import * as React from "react";
import { useSession } from "@/hooks/useSession";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/i18n/LanguageContext";

export default function Settings(){
  const { profile, session } = useSession();
  const { toast } = useToast();
  const { t } = useLang();
  const [displayName, setDisplayName] = React.useState(profile?.display_name ?? "");
  const [savingName, setSavingName] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [savingPw, setSavingPw] = React.useState(false);

  React.useEffect(() => { setDisplayName(profile?.display_name ?? ""); }, [profile?.display_name]);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!profile || name.length === 0 || name.length > 100) {
      toast({ title: t("set.badName"), description: t("set.badNameDesc"), variant: "destructive" });
      return;
    }
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", profile.id);
    setSavingName(false);
    if (error) toast({ title: t("set.saveFailed"), description: error.message, variant: "destructive" });
    else toast({ title: t("set.updated") });
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: t("set.badPw"), description: t("set.badPwDesc"), variant: "destructive" });
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPw(false);
    if (error) toast({ title: t("set.pwFailed"), description: error.message, variant: "destructive" });
    else { setNewPassword(""); toast({ title: t("set.pwUpdated") }); }
  };

  return <div className="space-y-6 max-w-xl">
    <h1 className="text-2xl font-bold">{t("set.title")}</h1>
    <Card><CardHeader><CardTitle>{t("set.profile")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      <div>{t("set.emailLabel")} <span className="font-medium">{profile?.email ?? session?.user.email}</span> <Badge className="ml-2 capitalize">{profile?.role}</Badge></div>
      <div>{t("set.userId")} <span className="font-mono text-xs">{profile?.id ?? session?.user.id}</span></div>
      <div>{t("set.currency")}</div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("set.nameTitle")}</CardTitle><CardDescription>{t("set.nameDesc")}</CardDescription></CardHeader><CardContent>
      <form onSubmit={saveName} className="flex flex-col sm:flex-row gap-2">
        <Input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder={t("set.namePh")} maxLength={100} />
        <Button type="submit" disabled={savingName}>{savingName ? t("set.saving") : t("set.save")}</Button>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("set.pwTitle")}</CardTitle><CardDescription>{t("set.pwDesc")}</CardDescription></CardHeader><CardContent>
      <form onSubmit={savePassword} className="flex flex-col sm:flex-row gap-2">
        <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} placeholder={t("set.pwPh")} />
        <Button type="submit" disabled={savingPw}>{savingPw ? t("set.updating") : t("set.update")}</Button>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("set.storage")}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">
      {t("set.storageA")} <code>receipts</code> {t("set.storageB")} <code>{"{user_id}/{request_id}/{filename}"}</code>.
    </CardContent></Card>
    <Button variant="destructive" onClick={()=>supabase.auth.signOut()}>{t("set.signOut")}</Button>
  </div>;
}
