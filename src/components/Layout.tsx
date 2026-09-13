import { Link, useLocation, useNavigate } from "react-router-dom";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Wallet, Receipt, Settings, ShieldCheck, Bell, LogOut, Search, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import { LanguageToggle, useLang } from "@/i18n/LanguageContext";
import type { StringKey } from "@/i18n/translations";

const nav = [
  { to: "/", key: "nav.dashboard" as const, icon: LayoutDashboard },
  { to: "/budgets", key: "nav.budgets" as const, icon: Wallet },
  { to: "/requests", key: "nav.requests" as const, icon: Receipt },
  { to: "/settings", key: "nav.settings" as const, icon: Settings },
];

const adminNav = { to: "/admin", key: "nav.admin" as const, icon: ShieldCheck };

type Tab = { to: string; key: StringKey; icon: LucideIcon; badge?: number };

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useSession();
  const { t } = useLang();
  const items = profile?.role === "owner" ? [...nav.slice(0, 3), adminNav, nav[3]] : nav;
  const loc = useLocation();
  const navgt = useNavigate();
  const qc = useQueryClient();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
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

  const tabs: Tab[] = [
    { to: "/", key: "nav.dashboard", icon: LayoutDashboard },
    { to: "/budgets", key: "nav.budgets", icon: Wallet },
    { to: "/requests", key: "nav.requests", icon: Receipt },
    ...(profile?.role === "owner"
      ? [{ to: "/admin", key: "nav.admin", icon: ShieldCheck } as Tab]
      : [{ to: "/settings", key: "nav.settings", icon: Settings } as Tab]),
    { to: "/notifications", key: "nav.notifications", icon: Bell, badge: unread ?? 0 },
  ];

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 shrink-0 border-r bg-card hidden md:flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b">
          <div className="font-bold text-lg">BudgetApp</div>
          <div className="text-xs text-muted-foreground">{t("nav.tagline")}</div>
          {profile && <Badge variant={profile.role === "owner" ? "default" : "secondary"} className="mt-2 capitalize">{profile.role}</Badge>}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <button onClick={() => setPaletteOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">
            <Search className="h-4 w-4" /> {t("cmd.search")}
            <kbd className="ml-auto rounded border border-input px-1.5 text-[10px] font-sans">⌘K</kbd>
          </button>
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
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-xs font-bold text-white">
              {(() => {
                const name = profile?.display_name || profile?.email || "?";
                return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => (w[0] ?? "").toUpperCase()).join("") || "?";
              })()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{profile?.email ?? profile?.display_name ?? t("nav.userFallback")}</div>
              <div className="text-xs text-muted-foreground capitalize">{profile?.role}</div>
            </div>
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
        <header className="md:hidden sticky top-0 z-30 border-b bg-card/95 backdrop-blur p-3 flex items-center justify-between">
          <span className="font-bold">BudgetApp</span>
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label={t("nav.settings")} onClick={() => navgt("/settings")}><Settings className="h-4 w-4" /></Button>
            <LanguageToggle />
            <ThemeToggle />
          </span>
        </header>
        <main className="flex-1 p-4 md:p-6 pb-28 md:pb-6 max-w-6xl w-full mx-auto"><div key={loc.pathname} className="animate-fade-up">{children}</div></main>
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur transform-gpu" aria-label="Primary">
          <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
            {tabs.map((tb) => {
              const active = tb.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(tb.to);
              return (
                <button
                  key={tb.to}
                  onClick={() => navgt(tb.to)}
                  className={`relative flex min-w-0 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-primary" />}
                  <span className="relative">
                    <tb.icon className="h-5 w-5" />
                    {!!tb.badge && tb.badge > 0 && <span className="absolute -top-1.5 -right-2.5 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1 leading-4">{tb.badge}</span>}
                  </span>
                  <span className="truncate max-w-full px-0.5">{t(tb.key)}</span>
                </button>
              );
            })}
          </div>
        </nav>
        <button onClick={() => setPaletteOpen(true)} aria-label={t("cmd.search")} className="md:hidden fixed bottom-24 right-4 z-40 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 p-3.5 text-white shadow-xl active:scale-95 transition-transform">
          <Search className="h-5 w-5" />
        </button>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
    </div>
  );
}
