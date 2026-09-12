import { useLang } from "@/i18n/LanguageContext";

export function MissingEnv() {
  const { t } = useLang();
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{t("me.title")}</h1>
        <p style={{ marginTop: 8, fontSize: 14, opacity: 0.8 }}>{t("me.body")}</p>
      </div>
    </div>
  );
}
