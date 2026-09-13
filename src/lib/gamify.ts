import type { InsightLang } from "./insights";

export type ReqLite = {
  requester_id: string;
  amount: number | string;
  category: string;
  status: string;
  created_at: string;
  merchant: string | null;
  receipt_url: string | null;
  due_date: string | null | undefined;
};

export type AchId =
  | "first-steps"
  | "receipt-pro"
  | "early-bird"
  | "on-fire"
  | "trusted"
  | "closer"
  | "regular"
  | "champion";

export type Unlock = { id: AchId; progress: number; goal: number };

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

/** Longest run of consecutive UTC-calendar days present in the list. */
function longestStreak(days: number[]): number {
  const uniq = [...new Set(days)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = -Infinity;
  for (const d of uniq) {
    run = d - prev === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

type Meta = { name: string; desc: string };

const META: Record<InsightLang, Record<AchId, Meta>> = {
  en: {
    "first-steps": { name: "First Steps", desc: "Submit your first request" },
    "receipt-pro": { name: "Receipt Pro", desc: "Attach receipts to 5 requests" },
    "early-bird": { name: "Early Bird", desc: "File 3 requests at least 2 days before due" },
    "on-fire": { name: "On Fire", desc: "Requests on 3 consecutive days" },
    trusted: { name: "Highly Trusted", desc: "10 reconciled with zero rejections" },
    closer: { name: "Closer", desc: "Reach 10 reconciled requests" },
    regular: { name: "Regular", desc: "Reach 25 reconciled requests" },
    champion: { name: "Champion", desc: "Reach 50 reconciled requests" },
  },
  id: {
    "first-steps": { name: "Langkah Pertama", desc: "Kirim permintaan pertamamu" },
    "receipt-pro": { name: "Tertib Struk", desc: "Lampirkan struk ke 5 permintaan" },
    "early-bird": { name: "Rajin Awal", desc: "Ajukan 3 permintaan minimal 2 hari sebelum jatuh tempo" },
    "on-fire": { name: "Menyala", desc: "Permintaan dalam 3 hari beruntun" },
    trusted: { name: "Sangat Dipercaya", desc: "10 direkonsiliasi tanpa penolakan" },
    closer: { name: "Makin Dekat", desc: "Capai 10 permintaan yang direkonsiliasi" },
    regular: { name: "Langganan", desc: "Capai 25 permintaan yang direkonsiliasi" },
    champion: { name: "Juara", desc: "Capai 50 permintaan yang direkonsiliasi" },
  },
};

export function achMeta(id: AchId, lang: InsightLang = "en"): Meta {
  return (META[lang] ?? META.en)[id];
}

/**
 * Evaluate every achievement for one user. Pure + deterministic.
 * `progress`/`goal` also drive the locked-state progress bars.
 */
export function achievementsFor(requests: ReqLite[], userId: string): Unlock[] {
  const mine = requests.filter((r) => r.requester_id === userId);
  const reconciled = mine.filter((r) => r.status === "reconciled").length;
  const rejected = mine.filter((r) => r.status === "rejected").length;
  const withReceipt = mine.filter((r) => !!r.receipt_url).length;
  const early = mine.filter((r) => {
    if (!r.due_date) return false;
    const due = startOfDay(new Date(r.due_date));
    const created = startOfDay(new Date(r.created_at));
    return due - created >= 2 * DAY_MS;
  }).length;
  const streak = longestStreak(mine.map((r) => startOfDay(new Date(r.created_at))));

  return [
    { id: "first-steps", progress: Math.min(mine.length, 1), goal: 1 },
    { id: "receipt-pro", progress: Math.min(withReceipt, 5), goal: 5 },
    { id: "early-bird", progress: Math.min(early, 3), goal: 3 },
    { id: "on-fire", progress: Math.min(streak, 3), goal: 3 },
    { id: "trusted", progress: rejected === 0 ? Math.min(reconciled, 10) : 0, goal: 10 },
    { id: "closer", progress: Math.min(reconciled, 10), goal: 10 },
    { id: "regular", progress: Math.min(reconciled, 25), goal: 25 },
    { id: "champion", progress: Math.min(reconciled, 50), goal: 50 },
  ];
}

export function isUnlocked(u: Unlock): boolean {
  return u.progress >= u.goal;
}

/**
 * XP rewards good habits, not spending: +10 filed, +5 receipt,
 * +10 approved-or-better, +10 more once reconciled.
 */
export function xpOf(requests: ReqLite[], userId: string): number {
  return requests
    .filter((r) => r.requester_id === userId)
    .reduce((xp, r) => {
      let v = 10;
      if (r.receipt_url) v += 5;
      if (r.status === "approved" || r.status === "reconciled") v += 10;
      if (r.status === "reconciled") v += 10;
      return xp + v;
    }, 0);
}

/** Level thresholds grow gently: level n needs n×100 cumulative XP. */
export function levelOf(xp: number): { level: number; into: number; span: number } {
  let level = 1;
  let base = 0;
  while (xp >= base + level * 100) {
    base += level * 100;
    level += 1;
  }
  return { level, into: xp - base, span: level * 100 };
}

/** XP per user across everyone (powers the duo scoreboard). */
export function duoTable(requests: ReqLite[]): { userId: string; xp: number }[] {
  const map = new Map<string, number>();
  for (const r of requests) {
    map.set(r.requester_id, (map.get(r.requester_id) ?? 0) + xpOf([r], r.requester_id));
  }
  return [...map.entries()]
    .map(([userId, xp]) => ({ userId, xp }))
    .sort((a, b) => b.xp - a.xp);
}
