import { Link, useLocation, useNavigate } from "react-router-dom";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Wallet, Receipt, Settings, ShieldCheck, Bell, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle, useLang } from "@/i18n/LanguageContext";

const nav = [
  { to: "/", key: "nav.dashboard" as const, icon: LayoutDashboard },
  { to: "/budgets", key: "nav.budgets" as const, icon: Wallet },
  { to: "/requests", key: "nav.requests" as const, icon: Receipt },
  { to: "/settings", key: "nav.settings" as const, icon: Settings },
];

const adminNav = { to: "/admin", key: "nav.admin" as const, icon: ShieldCheck };

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useSession();
  const { t } = useLang();
  const items = profile?.role === "owner" ? [...nav.slice(0, 3), adminNav, nav[3]] : nav;
  const loc = useLocation();
  const navgt = useNavigate();
  const qc = useQueryClient();
  const { data: unread } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!profile,
  });
  React.useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel("notif-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, profile]);
  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 border-r bg-card hidden md:flex flex-col">
        <div className="p-6 border-b">
          <div className="font-bold text-lg">BudgetApp</div>
          <div className="text-xs text-muted-foreground">{t("nav.tagline")}</div>
          {profile && <Badge variant={profile.role === "owner" ? "default" : "secondary"} className="mt-2 capitalize">{profile.role}</Badge>}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((n) => {
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <Link key={n.to} to={n.to} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                <n.icon className="h-4 w-4" /> {t(n.key)}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium truncate">{profile?.email ?? profile?.display_name ?? t("nav.userFallback")}</div>
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="sm" aria-label={t("nav.notifications")} onClick={() => navgt("/notifications")} className="relative">
                <Bell className="h-4 w-4" />
                {(unread ?? 0) > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1 leading-4">{unread}</span>}
              </Button>
              <ThemeToggle />
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <LanguageToggle />
            <Button variant="ghost" size="sm" className="justify-start" onClick={async () => { await signOut(); navgt("/login"); }}><LogOut className="h-4 w-4 mr-2" /> {t("nav.signOut")}</Button>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b bg-card p-3 flex items-center justify-between">
          <span className="font-bold">BudgetApp</span>
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="sm" aria-label={t("nav.notifications")} onClick={() => navgt("/notifications")} className="relative">
              <Bell className="h-4 w-4" />
              {(unread ?? 0) > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1 leading-4">{unread}</span>}
            </Button>
            <span className="text-xs capitalize">{profile?.role}</span>
            <LanguageToggle />
            <ThemeToggle />
          </span>
        </header>
        <nav className="md:hidden flex gap-1 p-2 border-b bg-card overflow-x-auto">
          {items.map((n) => (
            <Link key={n.to} to={n.to} className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${loc.pathname === n.to ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{t(n.key)}</Link>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
