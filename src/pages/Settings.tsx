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
  const [exporting, setExporting] = React.useState(false);

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

  const exportData = async () => {
    setExporting(true);
    try {
      const [b, r, l, c] = await Promise.all([
        supabase.from("budgets").select("*"),
        supabase.from("reimbursement_requests").select("*"),
        supabase.from("ledger_entries").select("*").order("created_at", { ascending: true }).limit(1000),
        supabase.from("categories").select("*"),
      ]);
      const err = b.error ?? r.error ?? l.error ?? c.error;
      if (err) throw err;
      const blob = new Blob(
        [JSON.stringify({ exported_at: new Date().toISOString(), budgets: b.data, requests: r.data, ledger: l.data, categories: c.data }, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budgetapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("set.exported") });
    } catch (e) {
      toast({ title: t("set.exportFailed"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
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
    <Card><CardHeader><CardTitle>{t("set.export")}</CardTitle><CardDescription>{t("set.exportDesc")}</CardDescription></CardHeader><CardContent>
      <Button variant="outline" onClick={exportData} disabled={exporting}>{exporting ? t("common.loading") : t("set.export")}</Button>
    </CardContent></Card>
    <Button variant="destructive" onClick={()=>supabase.auth.signOut()}>{t("set.signOut")}</Button>
  </div>;
}
