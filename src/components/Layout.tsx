import { Link, useLocation, useNavigate } from "react-router-dom";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Wallet, Receipt, Settings, ShieldCheck, Bell, LogOut, Search, Trophy, CalendarDays, NotebookPen, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserAvatar } from "@/components/UserAvatar";
import { CommandPalette } from "@/components/CommandPalette";
import { Tour } from "@/components/Tour";
import { LanguageToggle, useLang } from "@/i18n/LanguageContext";
import { initialsOf, useAvatarTheme } from "@/lib/avatar";
import type { StringKey } from "@/i18n/translations";

const nav = [
  { to: "/", key: "nav.dashboard" as const, icon: LayoutDashboard },
  { to: "/budgets", key: "nav.budgets" as const, icon: Wallet },
  { to: "/requests", key: "nav.requests" as const, icon: Receipt },
  { to: "/settings", key: "nav.settings" as const, icon: Settings },
];

const adminNav = { to: "/admin", key: "nav.admin" as const, icon: ShieldCheck };
const rewardsNav = { to: "/rewards", key: "nav.rewards" as const, icon: Trophy };
const calendarNav = { to: "/calendar", key: "nav.calendar" as const, icon: CalendarDays };
const spaceNav = { to: "/space", key: "nav.space" as const, icon: NotebookPen };

type Tab = { to: string; key: StringKey; icon: LucideIcon; badge?: number };

const TITLES: Record<string, StringKey> = {
  "/": "nav.dashboard",
  "/budgets": "budgets.title",
  "/budgets/new": "budgets.new",
  "/requests": "req.title",
  "/requests/new": "req.new",
  "/settings": "set.title",
  "/admin": "admin.title",
  "/notifications": "notif.title",
  "/rewards": "nav.rewards",
  "/calendar": "nav.calendar",
  "/space": "nav.space",
};

function titleFor(pathname: string): StringKey {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith("/budgets/")) return "budgets.title";
  if (pathname.startsWith("/requests/")) return "req.title";
  return "nav.dashboard";
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useSession();
  const { t } = useLang();
  const avatarCls = useAvatarTheme(profile?.id);
  const baseItems = [...nav.slice(0, 3), calendarNav, spaceNav, rewardsNav, nav[3]];
  const fullItems = profile?.role === "owner" ? [...baseItems.slice(0, 5), adminNav, baseItems[5]] : baseItems;
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
      : [{ to: "/space", key: "nav.space", icon: NotebookPen } as Tab]),
    { to: "/notifications", key: "nav.notifications", icon: Bell, badge: unread ?? 0 },
  ];

  const displayName = profile?.display_name || profile?.email || t("nav.userFallback");

  return (
    <div className="min-h-screen flex bg-muted/30 relative">
      <div aria-hidden className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      <aside className="w-[270px] shrink-0 border-r border-border/60 bg-card/80 backdrop-blur hidden md:flex flex-col sticky top-0 h-screen">
        <div className="p-5 pb-4 flex items-center gap-3">
          <span className="rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 p-2.5 text-white shadow-lg shadow-blue-500/25 shrink-0">
            <Wallet className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="font-bold text-[17px] tracking-tight leading-none">BudgetApp</div>
            <div className="text-[11px] text-muted-foreground mt-1 truncate">{t("nav.tagline")}</div>
          </div>
          {profile && <Badge variant={profile.role === "owner" ? "default" : "secondary"} className="ml-auto capitalize shrink-0">{profile.role}</Badge>}
        </div>
        <div className="px-5 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Menu</div>
        <nav className="flex-1 p-3 pt-2 space-y-1 overflow-y-auto">
          <button onClick={() => setPaletteOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground border border-dashed border-border/70 hover:bg-accent hover:text-accent-foreground transition-colors">
            <Search className="h-4 w-4" /> {t("cmd.search")}
            <kbd className="ml-auto rounded-md border border-input px-1.5 py-0.5 text-[10px] font-sans bg-background">⌘K</kbd>
          </button>
          {fullItems.map((n) => {
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <Link key={n.to} to={n.to} className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${active ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-500/25" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>
                <n.icon className="h-4 w-4 shrink-0" /> {t(n.key)}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border/60">
          <div className="rounded-2xl bg-muted/50 border border-border/60 p-3 flex items-center gap-2.5">
            {profile ? (
              <UserAvatar userId={profile.id} name={displayName} className="h-9 w-9 rounded-full" />
            ) : (
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarCls} text-xs font-bold text-white`}>{initialsOf(displayName)}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate" title={profile?.email ?? undefined}>{profile?.email ?? profile?.display_name ?? t("nav.userFallback")}</div>
              <div className="text-[11px] text-muted-foreground capitalize">{profile?.role}</div>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" onClick={async () => { await signOut(); navgt("/login"); }} aria-label={t("nav.signOut")} title={t("nav.signOut")}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="hidden md:flex sticky top-0 z-30 items-center justify-between gap-3 border-b border-border/60 bg-background/80 backdrop-blur px-6 py-3">
          <h2 className="text-lg font-bold tracking-tight">{t(titleFor(loc.pathname))}</h2>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setPaletteOpen(true)} className="text-muted-foreground" aria-label={t("cmd.search")}>
              <Search className="h-4 w-4" />
              <kbd className="rounded-md border border-input px-1.5 py-0.5 text-[10px] font-sans bg-background">⌘K</kbd>
            </Button>
            <Button variant="ghost" size="sm" aria-label={t("nav.notifications")} onClick={() => navgt("/notifications")} className="relative">
              <Bell className="h-4 w-4" />
              {(unread ?? 0) > 0 && <span className="absolute top-0.5 right-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1 leading-4">{unread}</span>}
            </Button>
            <ThemeToggle />
            <LanguageToggle />
            {profile
              ? <UserAvatar userId={profile.id} name={displayName} className="ml-1 h-8 w-8 text-[11px]" />
              : <span title={profile?.email ?? undefined} className={`ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${avatarCls} text-[11px] font-bold text-white`}>{initialsOf(displayName)}</span>}
          </div>
        </header>
        <header className="md:hidden sticky top-0 z-30 border-b border-border/60 bg-card/95 backdrop-blur p-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 p-1.5 text-white"><Wallet className="h-4 w-4" /></span>
            <span className="font-bold">BudgetApp</span>
          </span>
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label={t("nav.settings")} onClick={() => navgt("/settings")}><Settings className="h-4 w-4" /></Button>
            <LanguageToggle />
            <ThemeToggle />
          </span>
        </header>
        <main className="flex-1 p-4 md:p-6 pb-28 md:pb-8 max-w-6xl w-full mx-auto"><div key={loc.pathname} className="animate-fade-up">{children}</div></main>
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur transform-gpu" aria-label="Primary">
          <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
            {tabs.map((tb) => {
              const active = tb.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(tb.to);
              return (
                <button
                  key={tb.to}
                  onClick={() => navgt(tb.to)}
                  className={`relative flex min-w-0 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-gradient-to-r from-blue-500 to-violet-500" />}
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
        {profile && <Tour userId={profile.id} />}
      </div>
    </div>
  );
}
