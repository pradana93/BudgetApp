import * as React from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/i18n/LanguageContext";

export type AiAnswer = { text: string; ai: boolean };

/**
 * Ask the AI backend first (Gemini via edge function); fall back to the
 * on-device answer engine when unconfigured, offline, or erroring.
 */
export function useAiAssist() {
  const [loading, setLoading] = React.useState(false);
  const { lang } = useLang();

  const ask = React.useCallback(
    async (question: string, local: () => string | null): Promise<AiAnswer> => {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
        if (session && base && anon) {
          const res = await fetch(`${base}/functions/v1/ai-assist`, {
            method: "POST",
            headers: {
              apikey: anon,
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ question, lang }),
          });
          if (res.ok) {
            const j = (await res.json()) as { ok?: boolean; answer?: string };
            if (j?.ok && j.answer) return { text: j.answer, ai: true };
          }
        }
      } catch {
        /* fall through to local engine */
      } finally {
        setLoading(false);
      }
      return { text: local() ?? "", ai: false };
    },
    [lang]
  );

  return { ask, loading };
}
