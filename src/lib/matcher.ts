import Decimal from "decimal.js";
import { formatMoney } from "./money";
import type { InsightLang } from "./insights";

export type HistoryItem = {
  merchant: string | null;
  category: string;
  amount: number | string;
};

export type Suggestion = {
  category: string;
  confidence: number;
  /** true when confident enough to auto-pick without asking */
  auto: boolean;
  reasons: string[];
};

export type ReconScore = {
  score: number;
  reasons: string[];
  warnings: string[];
};

const AUTO_THRESHOLD = 90;

const norm = (s: string) => s.trim().toLowerCase();

const KEYWORDS: { category: string; words: string[] }[] = [
  { category: "groceries", words: ["indomaret", "alfamart", "super indo", "carrefour", "carefour", "hypermart", "lotte", "pasar", "grocery", "swalayan", "hero", "ranch market", "transmart"] },
  { category: "transport", words: ["shell", "pertamina", "bensin", "grab", "gojek", "kereta", "tol", "parkir", "taxi", "travel", "bus", "tiket", "mrt", "ojek"] },
  { category: "dining", words: ["resto", "cafe", "kopi", "starbucks", "mcd", "kfc", "warteg", "makan", "pizza", "sushi", "bakso", "sate", "dine", "burger", "dimsum"] },
  { category: "utilities", words: ["pln", "pdam", "telkom", "listrik", "internet", "wifi", "pulsa", "token", "indihome", "firstmedia", "telkomsel"] },
  { category: "health", words: ["apotek", "klinik", "rumah sakit", "dokter", "obat", "pharmacy", "puskesmas", "vitamin"] },
];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function mediansByCategory(history: HistoryItem[]): Map<string, number> {
  const groups = new Map<string, number[]>();
  for (const h of history) {
    const v = Number(h.amount);
    if (!(v > 0) || !h.category) continue;
    const arr = groups.get(h.category) ?? [];
    arr.push(v);
    groups.set(h.category, arr);
  }
  const out = new Map<string, number>();
  for (const [cat, arr] of groups) out.set(cat, median(arr));
  return out;
}

/**
 * Suggest the best-fit category for a new request, Xero-style.
 * Tiered signals: merchant memory > keyword rules > amount habits > fallback.
 * Pure + deterministic. Returns null when there is nothing to suggest from.
 */
export function suggestCategory(opts: {
  merchant: string;
  amount: string;
  history: HistoryItem[];
  categories: string[];
  currency?: string;
  lang?: InsightLang;
}): Suggestion | null {
  const { history, categories, currency = "IDR", lang = "en" } = opts;
  const id = lang === "id";
  if (categories.length === 0) return null;

  const m = norm(opts.merchant);
  const amt = Number(opts.amount);
  const medians = mediansByCategory(history);

  const priorNote = (cat: string): string | null => {
    const med = medians.get(cat);
    if (!med || !(amt > 0)) return null;
    if (Math.abs(amt - med) / med > 0.5) return null;
    return id
      ? `Dekat kebiasaan belanja ${cat} (~${formatMoney(med, currency)})`
      : `Near your usual ${cat} spend (~${formatMoney(med, currency)})`;
  };

  // 1) Merchant memory — the member filed this merchant before
  if (m) {
    const counts = new Map<string, number>();
    for (const h of history) {
      if (norm(h.merchant ?? "") === m && categories.includes(h.category)) {
        counts.set(h.category, (counts.get(h.category) ?? 0) + 1);
      }
    }
    let top: { cat: string; n: number } | null = null;
    for (const [cat, n] of counts) {
      if (!top || n > top.n) top = { cat, n };
    }
    if (top) {
      const reasons = [
        id
          ? `“${opts.merchant.trim()}” sebelumnya diajukan sebagai ${top.cat} ${top.n}×`
          : `“${opts.merchant.trim()}” filed as ${top.cat} ${top.n}× before`,
      ];
      const extra = priorNote(top.cat);
      if (extra) reasons.push(extra);
      const confidence = Math.min(97, 88 + 3 * top.n);
      return { category: top.cat, confidence, auto: confidence >= AUTO_THRESHOLD, reasons };
    }
  }

  // 2) Keyword rules
  if (m) {
    for (const { category, words } of KEYWORDS) {
      if (!categories.includes(category)) continue;
      const kw = words.find((w) => m.includes(w));
      if (kw) {
        const reasons = [
          id ? `Kata kunci “${kw}” menunjukkan ${category}` : `Keyword “${kw}” suggests ${category}`,
        ];
        const extra = priorNote(category);
        if (extra) reasons.push(extra);
        return { category, confidence: 80, auto: false, reasons };
      }
    }
  }

  // 3) Amount habits — close to this category's usual spend
  if (amt > 0) {
    let best: { cat: string; med: number; dist: number } | null = null;
    for (const [cat, med] of medians) {
      if (!categories.includes(cat) || med <= 0) continue;
      const dist = Math.abs(amt - med) / med;
      if (dist <= 0.5 && (!best || dist < best.dist)) best = { cat, med, dist };
    }
    if (best) {
      return {
        category: best.cat,
        confidence: 55,
        auto: false,
        reasons: [id
          ? `Dekat kebiasaan belanja ${best.cat} (~${formatMoney(best.med, currency)})`
          : `Near your usual ${best.cat} spend (~${formatMoney(best.med, currency)})`],
      };
    }
  }

  // 4) Fallback — most-used, else a sensible default
  const freq = new Map<string, number>();
  for (const h of history) {
    if (categories.includes(h.category)) freq.set(h.category, (freq.get(h.category) ?? 0) + 1);
  }
  let topFreq: string | null = null;
  for (const [cat, n] of freq) {
    if (!topFreq || (freq.get(topFreq) ?? 0) < n) topFreq = cat;
  }
  if (topFreq) {
    return {
      category: topFreq,
      confidence: 35,
      auto: false,
      reasons: [id ? "Kategori tersering Anda" : "Your most-used category"],
    };
  }
  const fallback = categories.includes("other") ? "other" : categories[0];
  return {
    category: fallback,
    confidence: 25,
    auto: false,
    reasons: [id ? "Saran bawaan" : "Default suggestion"],
  };
}

/**
 * Score how safely an approved request can be auto-reconciled (0–99).
 * Receipt + known merchant + within budget + due OK.
 */
export function reconciliationScore(opts: {
  amount: number | string;
  receiptUrl: string | null;
  dueDate: string | null | undefined;
  available: number | string;
  knownMerchant: boolean;
  lang?: InsightLang;
  now?: Date;
}): ReconScore {
  const { receiptUrl, knownMerchant, lang = "en", now = new Date() } = opts;
  const id = lang === "id";
  const amt = new Decimal(opts.amount || 0);
  const available = new Decimal(opts.available || 0);

  let score = 10;
  const reasons = [id ? "Detail lengkap" : "Details complete"];
  const warnings: string[] = [];

  if (receiptUrl) {
    score += 40;
    reasons.push(id ? "Struk terlampir" : "Receipt attached");
  }
  if (knownMerchant) {
    score += 25;
    reasons.push(id ? "Merchant dikenal" : "Known merchant");
  }
  if (amt.greaterThan(0) && amt.lessThanOrEqualTo(available)) {
    score += 20;
    reasons.push(id ? "Sesuai anggaran" : "Within budget");
  } else if (amt.greaterThan(available)) {
    warnings.push(id ? "Melebihi saldo tersedia" : "Exceeds available balance");
  }

  const due = opts.dueDate ? new Date(opts.dueDate) : null;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (!due || due >= startOfToday) {
    score += 5;
    reasons.push(id ? "Jatuh tempo OK" : "Due date OK");
  } else {
    warnings.push(id ? "Terlambat" : "Overdue");
  }

  return { score: Math.min(99, score), reasons, warnings };
}
