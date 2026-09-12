import type { Lang } from "@/i18n/translations";

/** BCP-47 locale matching the app language (NOT the browser default). */
export function dateLocale(lang: Lang): string {
  return lang === "id" ? "id-ID" : "en-US";
}

export function formatDate(value: string, lang: Lang): string {
  return new Date(value).toLocaleDateString(dateLocale(lang));
}

export function formatDateTime(value: string, lang: Lang): string {
  return new Date(value).toLocaleString(dateLocale(lang));
}

/** True when a pending request is past its due date (compares calendar days). */
export function isOverdue(dueDate: string | null | undefined, status: string, now: Date = new Date()): boolean {
  if (!dueDate || status !== "pending") return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(dueDate) < startOfToday;
}
