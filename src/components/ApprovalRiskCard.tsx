import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLang } from "@/i18n/LanguageContext";
import type { RiskScore } from "@/lib/advisor";

export function ApprovalRiskCard({ risk }: { risk: RiskScore }) {
  const { t } = useLang();
  const variant = risk.level === "risky" ? "destructive" as const : risk.level === "review" ? "pending" as const : "approved" as const;
  const label = risk.level === "risky" ? t("risk.risky") : risk.level === "review" ? t("risk.review") : t("risk.safe");
  const grad = risk.level === "risky" ? "from-red-500 to-orange-500" : risk.level === "review" ? "from-amber-500 to-yellow-500" : "from-emerald-500 to-teal-500";
  const pct = Math.min(100, Math.max(0, risk.score));
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <Card className="overflow-hidden border-primary/10">
      <div className={`h-1 w-full bg-gradient-to-r ${grad}`} />
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {t("risk.title")} <Badge variant={variant}>{label} {risk.score}</Badge>
          <span className="text-xs font-normal text-muted-foreground">{pct < 35 ? t("risk.safeDesc") : pct < 65 ? t("risk.reviewDesc") : t("risk.riskyDesc")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-4 items-center">
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" className="stroke-muted" strokeWidth="8" />
              <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8" strokeLinecap="round"
                className={risk.level === "risky" ? "stroke-red-500" : risk.level === "review" ? "stroke-amber-500" : "stroke-emerald-500"}
                strokeDasharray={circumference} strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular">{risk.score}</span><span className="text-[10px] uppercase tracking-wide text-muted-foreground">/99</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={`h-2 rounded-full bg-gradient-to-r ${grad} transition-all duration-700`} style={{ width: `${pct}%` }} /></div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{risk.reasons.map((r, i) => <li key={i} className="flex gap-1.5"><span className={risk.level === "risky" ? "text-red-500" : risk.level === "review" ? "text-amber-500" : "text-emerald-500"}>•</span><span>{r}</span></li>)}</ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
