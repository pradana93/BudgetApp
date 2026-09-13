import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate, dateLocale } from "@/lib/datetime";
import { useLang } from "@/i18n/LanguageContext";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CalReq = {
  id: string;
  merchant: string | null;
  category: string;
  amount: number;
  status: string;
  created_at: string;
  due_date: string | null;
};

const dotColor: Record<string, string> = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  reconciled: "bg-blue-500",
  rejected: "bg-red-500",
};

export default function Calendar() {
  const { t, lang } = useLang();
  const now = new Date();
  const [ym, setYm] = React.useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = React.useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["calendar-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_requests")
        .select("id,merchant,category,amount,status,created_at,due_date")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CalReq[];
    },
  });

  const byDay = React.useMemo(() => {
    const map = new Map<string, CalReq[]>();
    for (const r of data ?? []) {
      const key = (r.due_date ?? r.created_at).slice(0, 10);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return map;
  }, [data]);

  const startOffset = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString(dateLocale(lang), { month: "long", year: "numeric" });
  // 2026-09-07 is a Monday — stable anchor for localized weekday names.
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    new Date(2026, 8, 7 + i).toLocaleDateString(dateLocale(lang), { weekday: "short" })
  );
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const selList = selected ? byDay.get(selected) ?? [] : [];

  const shift = (d: number) => {
    setYm((v) => {
      const dt = new Date(v.y, v.m + d, 1);
      return { y: dt.getFullYear(), m: dt.getMonth() };
    });
    setSelected(null);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("cal.title")}</h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => shift(-1)} aria-label="previous month"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[140px] text-center text-sm font-medium capitalize">{monthLabel}</span>
          <Button variant="outline" size="sm" onClick={() => shift(1)} aria-label="next month"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {weekdays.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={`e-${i}`} />;
              const key = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const list = byDay.get(key) ?? [];
              const isSel = selected === key;
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(isSel ? null : key)}
                  className={`min-h-[52px] sm:min-h-[64px] rounded-xl border p-1 text-left transition-colors ${isSel ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/40"} ${isToday ? "ring-1 ring-primary" : ""}`}
                >
                  <div className={`text-xs font-semibold tabular ${isToday ? "text-primary" : ""}`}>{d}</div>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {list.slice(0, 4).map((r) => (
                      <span key={r.id} className={`h-1.5 w-1.5 rounded-full ${dotColor[r.status] ?? "bg-muted-foreground"}`} />
                    ))}
                    {list.length > 4 && <span className="text-[10px] text-muted-foreground">+{list.length - 4}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {selected && (
        <Card>
          <CardHeader><CardTitle className="text-base">{formatDate(selected, lang)}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {selList.length === 0 && <div className="text-sm text-muted-foreground">{t("cal.noDay")}</div>}
            {selList.map((r) => (
              <Link key={r.id} to={`/requests/${r.id}`} className="flex items-center justify-between gap-2 border-b last:border-0 py-2 text-sm">
                <span className="truncate">{r.merchant ?? r.category}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="tabular">{formatMoney(Number(r.amount))}</span>
                  <Badge variant={r.status as never}>{r.status}</Badge>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
