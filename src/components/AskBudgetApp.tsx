import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/i18n/LanguageContext";
import { useAiAssist } from "@/hooks/useAiAssist";
import { answerQuestion, getAskSuggestions, type AskCtx } from "@/lib/advisor";
import { Sparkles, Send, Trash2, Copy, History, Lightbulb, MessageCircle } from "lucide-react";

type Msg = { id: string; role: "user" | "assistant"; text: string; ai: boolean; ts: number };

const STORAGE_KEY = "budgetapp-ask-history-v2";

function load(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Msg[];
    return Array.isArray(arr) ? arr.slice(-30) : [];
  } catch { return []; }
}
function save(msgs: Msg[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-30))); } catch { /* ignore */ }
}

export default function AskBudgetApp({ ctx }: { ctx: AskCtx }) {
  const { t, lang } = useLang();
  const { ask, loading } = useAiAssist();
  const [q, setQ] = React.useState("");
  const [msgs, setMsgs] = React.useState<Msg[]>(() => load());
  const [copied, setCopied] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => save(msgs), [msgs]);
  React.useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, loading]);

  const suggestions = React.useMemo(() => getAskSuggestions(lang), [lang]);

  const send = async (prompt: string) => {
    const text = prompt.trim();
    if (!text || loading) return;
    const umsg: Msg = { id: `u-${Date.now()}`, role: "user", text, ai: false, ts: Date.now() };
    setMsgs((m) => [...m, umsg]);
    setQ("");
    const r = await ask(text, () => answerQuestion(text, ctx, lang));
    const amsg: Msg = { id: `a-${Date.now()}`, role: "assistant", text: r.text || t("ask.noAnswer"), ai: r.ai, ts: Date.now() };
    setMsgs((m) => [...m, amsg]);
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); void send(q); };
  const clear = () => { setMsgs([]); try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ } };
  const copy = async (txt: string, id: string) => {
    try { await navigator.clipboard.writeText(txt); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* */ }
  };

  return (
    <Card className="overflow-hidden border-primary/10">
      <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="rounded-xl bg-white/15 p-2 backdrop-blur"><Sparkles className="h-5 w-5" /></span>
            <div>
              <div className="font-bold leading-none flex items-center gap-2">{t("ask.title")} <Badge variant="secondary" className="bg-white text-violet-700 hover:bg-white text-[10px]">FLAGSHIP</Badge></div>
              <div className="text-xs text-white/85 mt-1">{t("ask.subtitle")}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="bg-white/10 text-white border-white/20"><History className="h-3 w-3 mr-1" />{msgs.length}</Badge>
            {msgs.length>0 && <Button size="sm" variant="secondary" className="h-7 bg-white/15 text-white hover:bg-white hover:text-violet-700 border-white/20" onClick={clear}><Trash2 className="h-3.5 w-3.5 mr-1" />{t("ask.clear")}</Button>}
          </div>
        </div>
      </div>

      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-amber-500" />{t("ask.suggestions")}</CardTitle>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {suggestions.map((s) => (
            <button key={s.prompt} onClick={() => void send(s.prompt)} className="rounded-full border bg-muted/60 hover:bg-muted px-2.5 py-1 text-xs transition">
              {s.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div ref={listRef} className="max-h-[360px] overflow-auto rounded-xl border bg-muted/20 p-3 space-y-3 scroll-smooth">
          {msgs.length===0 ? (
            <div className="text-center py-6 space-y-2">
              <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground/60" />
              <div className="text-sm font-medium">{t("ask.emptyTitle")}</div>
              <div className="text-xs text-muted-foreground max-w-sm mx-auto">{t("ask.emptyBody")}</div>
            </div>
          ) : msgs.map((m) => (
            <div key={m.id} className={`flex ${m.role==="user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${m.role==="user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-white border rounded-bl-sm"}`}>
                <div>{m.text}</div>
                {m.role==="assistant" && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <Badge variant={m.ai ? "default" : "secondary"} className="text-[10px] h-5">{m.ai ? t("ask.ai") : t("ask.local")}</Badge>
                    <button onClick={() => void copy(m.text, m.id)} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted">
                      <Copy className="h-3 w-3" />{copied===m.id ? t("ask.copied") : t("ask.copy")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-sm border bg-white px-3.5 py-2.5 text-sm"><span className="inline-flex gap-1"><span className="animate-bounce">•</span><span className="animate-bounce [animation-delay:120ms]">•</span><span className="animate-bounce [animation-delay:240ms]">•</span></span> {t("ask.thinking")}</div></div>}
        </div>

        <form onSubmit={onSubmit} className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ask.ph")} maxLength={200} className="flex-1" />
          <Button type="submit" disabled={loading || !q.trim()} className="shrink-0"><Send className="h-4 w-4 mr-1" />{loading ? t("ask.thinking") : t("ask.button")}</Button>
        </form>
        <div className="text-[11px] text-muted-foreground">{t("ask.hint")}</div>
      </CardContent>
    </Card>
  );
}
