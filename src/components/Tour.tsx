import * as React from "react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n/LanguageContext";
import { Wallet, Receipt, ShieldCheck, Trophy } from "lucide-react";

const STEPS = [
  { icon: Wallet, title: "tour.s1t", desc: "tour.s1d" },
  { icon: Receipt, title: "tour.s2t", desc: "tour.s2d" },
  { icon: ShieldCheck, title: "tour.s3t", desc: "tour.s3d" },
  { icon: Trophy, title: "tour.s4t", desc: "tour.s4d" },
] as const;

/** First-run welcome tour, remembered per user. */
export function Tour({ userId }: { userId: string }) {
  const { t } = useLang();
  const [step, setStep] = React.useState(0);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      if (!window.localStorage.getItem(`budgetapp-tour-${userId}`)) {
        const timer = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(timer);
      }
    } catch {
      setVisible(true);
    }
    return undefined;
  }, [userId]);

  const finish = () => {
    try {
      window.localStorage.setItem(`budgetapp-tour-${userId}`, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;
  const s = STEPS[Math.min(step, STEPS.length - 1)];
  const last = step >= STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-label={t("tour.s1t")}>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-2xl animate-pop">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg">
          <s.icon className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-xl font-bold tracking-tight">{t(s.title)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(s.desc)}</p>
        <div className="mt-4 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} />
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" onClick={finish} className="flex-1">{t("tour.skip")}</Button>
          {step > 0 && <Button variant="outline" onClick={() => setStep((v) => v - 1)} className="flex-1">{t("tour.back")}</Button>}
          <Button onClick={() => (last ? finish() : setStep((v) => v + 1))} className="flex-1">
            {last ? t("tour.done") : t("tour.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
