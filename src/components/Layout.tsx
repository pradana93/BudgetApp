import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Wallet, Receipt, Settings, ShieldCheck, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/requests", label: "Requests", icon: Receipt },
  { to: "/settings", label: "Settings", icon: Settings },
];

const adminNav = { to: "/admin", label: "Admin", icon: ShieldCheck };

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useSession();
  const items = profile?.role === "owner" ? [...nav.slice(0, 3), adminNav, nav[3]] : nav;
  const loc = useLocation();
  const navgt = useNavigate();
  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 border-r bg-card hidden md:flex flex-col">
        <div className="p-6 border-b">
          <div className="font-bold text-lg">BudgetApp</div>
          <div className="text-xs text-muted-foreground">Xero-style reconciliation</div>
          {profile && <Badge variant={profile.role === "owner" ? "default" : "secondary"} className="mt-2 capitalize">{profile.role}</Badge>}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((n) => {
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <Link key={n.to} to={n.to} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium truncate">{profile?.email ?? profile?.display_name ?? "User"}</div>
            <ThemeToggle />
          </div>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={async () => { await signOut(); navgt("/login"); }}><LogOut className="h-4 w-4 mr-2" /> Sign out</Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b bg-card p-3 flex items-center justify-between">
          <span className="font-bold">BudgetApp</span>
          <span className="flex items-center gap-2">
            <span className="text-xs capitalize">{profile?.role}</span>
            <ThemeToggle />
          </span>
        </header>
        <nav className="md:hidden flex gap-1 p-2 border-b bg-card overflow-x-auto">
          {items.map((n) => (
            <Link key={n.to} to={n.to} className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${loc.pathname === n.to ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{n.label}</Link>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
