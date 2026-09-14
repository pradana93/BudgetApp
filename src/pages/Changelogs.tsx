import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CHANGELOGS } from "@/lib/changelogs";
import { useLang } from "@/i18n/LanguageContext";
import { Sparkles, History } from "lucide-react";

const SEEN_KEY = "budgetapp-changelog-seen";

export default function Changelogs() {
  const { t } = useLang();
  React.useEffect(() => {
    try { localStorage.setItem(SEEN_KEY, CHANGELOGS[0].version); } catch { /* */ }
  }, []);
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><History className="h-6 w-6" />{t("changelog.title")}</h1>
        <p className="text-sm text-white/80 mt-1">{t("changelog.sub")}</p>
      </div>
      {CHANGELOGS.map((c) => (
        <Card key={c.version} className="overflow-hidden">
          <div className={`h-1 w-full ${c.tag === "flagship" ? "bg-gradient-to-r from-violet-600 to-blue-600" : c.tag === "feat" ? "bg-emerald-500" : "bg-muted"}`} />
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {c.version} <Badge variant={c.tag === "flagship" ? "default" : c.tag === "feat" ? "approved" : "secondary"}>{c.tag ?? "update"}</Badge>
              <span className="text-xs font-normal text-muted-foreground">{c.date}</span>
              {c.tag === "flagship" && <Sparkles className="h-4 w-4 text-violet-600" />}
            </CardTitle>
            <div className="font-semibold">{c.title}</div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">{c.items.map((it, i) => <li key={i}>• {it}</li>)}</ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function useChangelogBadge(): number {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (!seen) { setCount(CHANGELOGS.length); return; }
      const idx = CHANGELOGS.findIndex((c) => c.version === seen);
      setCount(idx > 0 ? idx : 0);
    } catch { setCount(0); }
  }, []);
  return count;
}
