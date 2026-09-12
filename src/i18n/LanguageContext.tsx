import * as React from "react";
import { Button } from "@/components/ui/button";
import { STRINGS, translate, type Lang, type StringKey } from "./translations";

type LangContext = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
};

const Ctx = React.createContext<LangContext | null>(null);

function getInitial(): Lang {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem("budgetapp-lang") === "id" ? "id" : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(getInitial);

  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem("budgetapp-lang", l);
    } catch {
      /* storage unavailable — lang still applies for this session */
    }
  }, []);

  const t = React.useCallback((key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  React.useEffect(() => {
    document.documentElement.lang = lang === "id" ? "id" : "en";
  }, [lang]);

  const value = React.useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useLang must be inside LanguageProvider");
  return ctx;
}

export function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <span className="flex items-center rounded-md border border-input overflow-hidden" role="group" aria-label="Language / Bahasa">
      {(Object.keys(STRINGS) as Lang[]).map((l) => (
        <Button
          key={l}
          variant={lang === l ? "default" : "ghost"}
          size="sm"
          className="rounded-none border-0 px-2 uppercase"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
        >
          {l}
        </Button>
      ))}
    </span>
  );
}
