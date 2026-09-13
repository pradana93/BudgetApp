import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/i18n/LanguageContext";
import { usePwa } from "@/hooks/usePwa";
import { Download } from "lucide-react";
import { AVATAR_THEMES, initialsOf, setAvatarTheme, useAvatarTheme, isAcceptedAvatar, prepareAvatar, avatarPublicUrl } from "@/lib/avatar";
import { xpOf, levelOf, type ReqLite } from "@/lib/gamify";
import { formatDate } from "@/lib/datetime";
import { Check, Trophy } from "lucide-react";

export default function Settings(){
  const { profile, session, refresh } = useSession();
  const { toast } = useToast();
  const { t, lang } = useLang();
  const pwa = usePwa();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = React.useState(profile?.display_name ?? "");
  const [savingName, setSavingName] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [savingPw, setSavingPw] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [imgFailed, setImgFailed] = React.useState(false);
  const [photoVer, setPhotoVer] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const avatarCls = useAvatarTheme(profile?.id);
  const name = profile?.display_name || profile?.email || session?.user.email || t("nav.userFallback");
  const photoSrc = profile?.avatar_url && !imgFailed
    ? `${profile.avatar_url}?v=${photoVer}`
    : null;

  React.useEffect(() => { setDisplayName(profile?.display_name ?? ""); }, [profile?.display_name]);

  const { data: mine } = useQuery({
    queryKey: ["my-stats"],
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase.from("reimbursement_requests").select("status,receipt_url").eq("requester_id", profile.id).limit(500);
      if (error) throw error;
      return (data ?? []) as { status: string; receipt_url: string | null }[];
    },
    enabled: !!profile,
  });

  const { data: joinedRow } = useQuery({
    queryKey: ["profile-joined"],
    queryFn: async () => {
      if (!profile) return null;
      const { data, error } = await supabase.from("profiles").select("created_at").eq("id", profile.id).single();
      if (error) throw error;
      return data as { created_at: string } | null;
    },
    enabled: !!profile,
  });

  const lite = (mine ?? []) as unknown as ReqLite[];
  const xp = xpOf(lite, profile?.id ?? "");
  const lvl = levelOf(xp);
  const filed = lite.length;
  const reconciled = lite.filter((r) => r.status === "reconciled").length;
  const decided = lite.filter((r) => r.status !== "pending").length;
  const approvedLike = lite.filter((r) => r.status === "approved" || r.status === "reconciled").length;
  const rate = decided > 0 ? Math.round((approvedLike / decided) * 100) : null;

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!profile || trimmed.length === 0 || trimmed.length > 100) {
      toast({ title: t("set.badName"), description: t("set.badNameDesc"), variant: "destructive" });
      return;
    }
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", profile.id);
    setSavingName(false);
    if (error) toast({ title: t("set.saveFailed"), description: error.message, variant: "destructive" });
    else { toast({ title: t("set.updated") }); refresh(); qc.invalidateQueries({ queryKey: ["profile-avatar", profile.id] }); }
  };

  const onPickFile = async (f: File | null) => {
    if (!f || !profile) return;
    if (!isAcceptedAvatar(f)) { toast({ title: t("profile.badType"), variant: "destructive" }); return; }
    setUploading(true);
    try {
      const blob = await prepareAvatar(f);
      const path = `${profile.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: avatarPublicUrl(profile.id) }).eq("id", profile.id);
      if (dbErr) throw dbErr;
      setImgFailed(false);
      setPhotoVer((v) => v + 1);
      refresh();
      qc.invalidateQueries({ queryKey: ["profile-avatar", profile.id] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: t("profile.uploaded") });
    } catch (e) {
      toast({ title: t("profile.uploadFailed"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    if (!profile) return;
    setUploading(true);
    try {
      await supabase.storage.from("avatars").remove([`${profile.id}/avatar.jpg`]);
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
      if (error) throw error;
      refresh();
      qc.invalidateQueries({ queryKey: ["profile-avatar", profile.id] });
      toast({ title: t("profile.removed") });
    } catch (e) {
      toast({ title: t("profile.uploadFailed"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
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

  return <div className="space-y-6 max-w-2xl">
    <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white p-6 flex flex-wrap items-center gap-4 shadow-lg overflow-hidden relative">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label={photoSrc ? t("profile.change") : t("profile.upload")}
          className={`group relative block h-20 w-20 overflow-hidden rounded-3xl ring-4 ring-white/30 shadow-xl transition-transform hover:scale-[1.03] active:scale-95 ${photoSrc ? "" : `bg-gradient-to-br ${avatarCls}`}`}
        >
          {photoSrc
            ? <img src={photoSrc} alt={name} onError={() => setImgFailed(true)} className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-2xl font-bold">{initialsOf(name)}</span>}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? t("common.loading") : photoSrc ? t("profile.change") : t("profile.upload")}
          </span>
        </button>
        {photoSrc && !uploading && (
          <button
            type="button"
            onClick={removePhoto}
            aria-label={t("profile.remove")}
            className="absolute -bottom-1 -right-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 shadow-md hover:opacity-90"
          >
            {t("profile.remove")}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="relative min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight truncate">{name}</h1>
        <p className="text-sm text-white/80 truncate">{profile?.email ?? session?.user.email}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">{profile?.role}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-white/85"><Trophy className="h-3.5 w-3.5" />{t("reward.level", { n: lvl.level })} • {xp} XP</span>
          {joinedRow && <span className="text-xs text-white/70">{t("profile.memberSince")} {formatDate(joinedRow.created_at, lang)}</span>}
        </div>
        <div className="mt-2 h-2 max-w-xs rounded-full bg-white/25 overflow-hidden">
          <div className="h-2 rounded-full bg-white transition-all" style={{ width: `${Math.round((lvl.into / lvl.span) * 100)}%` }} />
        </div>
      </div>
    </div>

    <div className="grid gap-4 grid-cols-3">
      <Card className="card-lift"><CardContent className="pt-5 text-center"><div className="stat-value">{filed}</div><div className="text-xs text-muted-foreground mt-1">{t("profile.filed")}</div></CardContent></Card>
      <Card className="card-lift"><CardContent className="pt-5 text-center"><div className="stat-value">{reconciled}</div><div className="text-xs text-muted-foreground mt-1">{t("profile.reconciled")}</div></CardContent></Card>
      <Card className="card-lift"><CardContent className="pt-5 text-center"><div className="stat-value">{rate === null ? "—" : `${rate}%`}</div><div className="text-xs text-muted-foreground mt-1">{t("profile.approvalRate")}</div></CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>{t("profile.customize")}</CardTitle><CardDescription>{t("profile.customizeDesc")}</CardDescription></CardHeader><CardContent>
      <div className="flex flex-wrap gap-3">
        {AVATAR_THEMES.map((th) => {
          const selected = th.cls === avatarCls;
          return (
            <button key={th.id} type="button" title={th.id} aria-label={th.id} aria-pressed={selected}
              onClick={() => { if (profile) setAvatarTheme(profile.id, th.id); }}
              className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${th.cls} text-white shadow-md transition-transform active:scale-95 ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:scale-105"}`}>
              {selected && <Check className="h-5 w-5" />}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? t("common.loading") : photoSrc ? t("profile.change") : t("profile.upload")}
        </Button>
        {photoSrc && (
          <Button type="button" variant="ghost" size="sm" onClick={removePhoto} disabled={uploading}>{t("profile.remove")}</Button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("profile.photoDesc")}</p>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>{t("profile.editTitle")}</CardTitle><CardDescription>{t("set.nameDesc")}</CardDescription></CardHeader><CardContent>
      <form onSubmit={saveName} className="flex flex-col sm:flex-row gap-2">
        <Input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder={t("set.namePh")} maxLength={100} />
        <Button type="submit" disabled={savingName}>{savingName ? t("set.saving") : t("set.save")}</Button>
      </form>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>{t("profile.security")}</CardTitle><CardDescription>{t("set.pwDesc")}</CardDescription></CardHeader><CardContent>
      <form onSubmit={savePassword} className="flex flex-col sm:flex-row gap-2">
        <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} placeholder={t("set.pwPh")} />
        <Button type="submit" disabled={savingPw}>{savingPw ? t("set.updating") : t("set.update")}</Button>
      </form>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>{t("profile.yourData")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("set.storageA")} <code>receipts</code> {t("set.storageB")} <code>{"{user_id}/{request_id}/{filename}"}</code>.
      </p>
      <Button variant="outline" onClick={exportData} disabled={exporting}>{exporting ? t("common.loading") : t("set.export")}</Button>
      <p className="text-xs text-muted-foreground">{t("set.exportDesc")}</p>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>{t("set.install")}</CardTitle><CardDescription>{t("set.installDesc")}</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {pwa.installed
          ? <Badge variant="approved">{t("set.installed")}</Badge>
          : pwa.canInstall
            ? <Button variant="outline" onClick={pwa.install}><Download className="h-4 w-4 mr-2" />{t("set.install")}</Button>
            : <span className="text-sm text-muted-foreground">{t("set.installLater")}</span>}
      </div>
      <div className="border-t pt-3">
        <div className="text-sm font-medium mb-1">{t("set.push")}</div>
        <p className="text-sm text-muted-foreground mb-2">{t("set.pushDesc")}</p>
        {!pwa.supported
          ? <div className="text-sm text-muted-foreground">{t("set.pushUnsupported")}</div>
          : <Button variant="outline" disabled={pwa.busy} onClick={async () => {
              const turningOff = pwa.subscribed;
              const ok = turningOff ? await pwa.unsubscribe() : await pwa.subscribe();
              if (ok) toast({ title: turningOff ? t("set.pushOff") : t("set.pushOn") });
              else toast({ title: t("set.pushUnsupported"), variant: "destructive" });
            }}>{pwa.subscribed ? t("set.disable") : t("set.enable")}</Button>}
      </div>
    </CardContent></Card>

    <Button variant="destructive" onClick={()=>supabase.auth.signOut()}>{t("set.signOut")}</Button>
    <div className="text-xs text-muted-foreground">Build {typeof __GIT_SHA__ !== "undefined" ? __GIT_SHA__.slice(0, 7) : "local"}</div>
  </div>;
}
