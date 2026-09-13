import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/i18n/LanguageContext";
import { formatDateTime } from "@/lib/datetime";
import { Bell } from "lucide-react";

type Notification = { id: string; type: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string };

export default function Notifications() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t, lang } = useLang();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  React.useEffect(() => {
    const ch = supabase.channel("notifications-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const markAll = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["notifications-unread"] }); },
    onError: (e: Error) => toast({ title: t("notif.failed"), description: e.message, variant: "destructive" }),
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["notifications-unread"] }); },
  });

  const clearRead = useMutation({    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("notifications").delete().eq("user_id", user.id).eq("is_read", true);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); toast({ title: t("notif.cleared") }); },
    onError: (e: Error) => toast({ title: t("notif.failed"), description: e.message, variant: "destructive" }),
  });

  const unread = (data ?? []).filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-2xl font-bold">{t("notif.title")} {unread > 0 && <Badge variant="pending" className="ml-2">{t("notif.unread", { n: unread })}</Badge>}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending || unread === 0}>{t("notif.markAll")}</Button>
          <Button variant="outline" size="sm" onClick={() => clearRead.mutate()} disabled={clearRead.isPending}>{t("notif.clear")}</Button>
        </div>
      </div>
      <Card><CardHeader><CardTitle>{t("notif.recent")}</CardTitle></CardHeader><CardContent className="space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
        {(data?.length ?? 0) === 0 && !isLoading && <div className="flex flex-col items-center gap-2 py-8 text-center"><span className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-3 text-white shadow-lg"><Bell className="h-6 w-6" /></span><div className="text-sm text-muted-foreground">{t("notif.empty")}</div></div>}
        {data?.map((n) => (
          <Link key={n.id} to={n.link ?? "/"} onClick={() => { if (!n.is_read) markOne.mutate(n.id); }} className={`flex justify-between gap-3 border-b py-2 text-sm rounded px-2 ${n.is_read ? "opacity-70" : "bg-muted/40"}`}>
            <span><span className="font-medium">{n.title}</span><span className="text-muted-foreground"> — {n.body}</span></span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(n.created_at, lang)}</span>
          </Link>
        ))}
      </CardContent></Card>
    </div>
  );
}
