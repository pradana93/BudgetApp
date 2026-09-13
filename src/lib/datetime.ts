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

/** Compact relative time in the app language ("just now", "5m ago", …). */
export function timeAgo(ts: string, lang: Lang, now: Date = new Date()): string {
  const id = lang === "id";
  const s = Math.max(0, Math.floor((now.getTime() - new Date(ts).getTime()) / 1000));
  if (s < 60) return id ? "baru saja" : "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return id ? `${m} mnt lalu` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return id ? `${h} jam lalu` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return id ? `${d} hari lalu` : `${d}d ago`;
}
