import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { useLang } from "@/i18n/LanguageContext";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import {
  LayoutDashboard, Wallet, Receipt, Settings, ShieldCheck, Bell,
  Plus, LogOut, Languages, type LucideIcon,
} from "lucide-react";
import type { StringKey } from "@/i18n/translations";

type Item = {
  id: string;
  group: StringKey;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
};

/** Spotlight-style command palette: pages, records and actions. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { profile, signOut } = useSession();
  const { t, lang, setLang } = useLang();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { data: budgets } = useQuery({
    queryKey: ["cmd-budgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("id,name,total_amount,currency").order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; total_amount: number; currency: string }[];
    },
    enabled: open,
  });
  const { data: requests } = useQuery({
    queryKey: ["cmd-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reimbursement_requests").select("id,merchant,category,amount,status").order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return (data ?? []) as { id: string; merchant: string | null; category: string; amount: number; status: string }[];
    },
    enabled: open,
  });

  React.useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open ]);

  const go = (to: string) => {
    onClose();
    nav(to);
  };

  const needle = q.trim().toLowerCase();
  const match = (s: string) => !needle || s.toLowerCase().includes(needle);

  const pages: Item[] = [
    { id: "p-dash", group: "cmd.pages", label: t("nav.dashboard"), icon: LayoutDashboard, run: () => go("/") },
    { id: "p-budgets", group: "cmd.pages", label: t("nav.budgets"), icon: Wallet, run: () => go("/budgets") },
    { id: "p-requests", group: "cmd.pages", label: t("nav.requests"), icon: Receipt, run: () => go("/requests") },
    ...(profile?.role === "owner"
      ? [{ id: "p-admin", group: "cmd.pages" as StringKey, label: t("nav.admin"), icon: ShieldCheck, run: () => go("/admin") }]
      : []),
    { id: "p-notif", group: "cmd.pages", label: t("nav.notifications"), icon: Bell, run: () => go("/notifications") },
    { id: "p-settings", group: "cmd.pages", label: t("nav.settings"), icon: Settings, run: () => go("/settings") },
  ];

  const records: Item[] = [
    ...(budgets ?? []).map((b) => ({
      id: `b-${b.id}`, group: "cmd.records" as StringKey, label: b.name,
      hint: formatMoney(Number(b.total_amount), b.currency), icon: Wallet, run: () => go(`/budgets/${b.id}`),
    })),
    ...(requests ?? []).map((r) => ({
      id: `r-${r.id}`, group: "cmd.records" as StringKey, label: r.merchant ?? r.category,
      hint: `${formatMoney(Number(r.amount))} • ${r.status}`, icon: Receipt, run: () => go(`/requests/${r.id}`),
    })),
  ];

  const actions: Item[] = [
    { id: "a-newreq", group: "cmd.actions", label: t("cmd.newRequest"), icon: Plus, run: () => go("/requests/new") },
    { id: "a-newbud", group: "cmd.actions", label: t("cmd.newBudget"), icon: Plus, run: () => go("/budgets") },
    {
      id: "a-lang", group: "cmd.actions", label: t("cmd.switchLang"), icon: Languages,
      run: () => { setLang(lang === "en" ? "id" : "en"); onClose(); },
    },
    {
      id: "a-signout", group: "cmd.actions", label: t("cmd.signOut"), icon: LogOut,
      run: async () => { await signOut(); onClose(); nav("/login"); },
    },
  ];

  const items = [...pages, ...records, ...actions].filter((i) => match(i.label) || (i.hint ? match(i.hint) : false));
  const safeActive = items.length === 0 ? 0 : Math.min(active, items.length - 1);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length === 0 ? 0 : (a + 1) % items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length === 0 ? 0 : (a - 1 + items.length) % items.length));
    } else if (e.key === "Enter") {
      items[safeActive]?.run();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  let lastGroup: StringKey | null = null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 md:pt-32 px-4" role="dialog" aria-label={t("cmd.search")}>
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border bg-card shadow-2xl animate-pop overflow-hidden">
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={onKey}
          placeholder={t("cmd.placeholder")}
          className="border-0 border-b rounded-none h-12 text-base focus-visible:ring-0"
        />
        <div className="max-h-[50vh] overflow-auto p-2">
          {items.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">{t("cmd.noResults")}</div>}
          {items.map((item, idx) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <React.Fragment key={item.id}>
                {header && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(header)}</div>}
                <button
                  onClick={() => item.run()}
                  onMouseEnter={() => setActive(idx)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left ${idx === safeActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className={`text-xs truncate ${idx === safeActive ? "opacity-80" : "text-muted-foreground"}`}>{item.hint}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">{t("cmd.hint")}</div>
      </div>
    </div>
  );
}
