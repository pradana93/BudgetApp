import Decimal from "decimal.js";
import { formatMoney } from "./money";
import type { InsightLang } from "./insights";

export type RiskLevel = "safe" | "review" | "risky";

export type RiskScore = {
  score: number;
  level: RiskLevel;
  reasons: string[];
};

export type LiteReq = {
  id?: string;
  merchant: string | null;
  amount: number | string;
  category: string;
  status: string;
  created_at: string;
  receipt_url?: string | null;
  due_date?: string | null;
};

const normM = (m: string | null | undefined) => (m ?? "").trim().toLowerCase();
const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Approval risk for a pending request (0 = safe, 99 = risky).
 * Pure + deterministic. Higher score means "look closer".
 */
export function approvalRisk(
  req: LiteReq,
  budget: { available_amount: number | string; total_amount: number | string } | null,
  history: LiteReq[],
  lang: InsightLang = "en"
): RiskScore {
  const id = lang === "id";
  const amt = new Decimal(num(req.amount));
  const reasons: string[] = [];
  let score = 0;

  if (budget) {
    const available = new Decimal(num(budget.available_amount));
    if (amt.greaterThan(available)) {
      score += 40;
      reasons.push(
        id
          ? `Melebihi saldo tersedia (${formatMoney(available.toNumber())})`
          : `Exceeds available balance (${formatMoney(available.toNumber())})`
      );
    }
    const total = new Decimal(num(budget.total_amount));
    if (total.greaterThan(0) && amt.div(total).greaterThan(0.5)) {
      score += 15;
      reasons.push(id ? "Melebihi setengah total anggaran" : "Over half the total budget");
    }
  }

  if (!req.receipt_url) {
    score += 15;
    reasons.push(id ? "Tidak ada struk terlampir" : "No receipt attached");
  }

  const m = normM(req.merchant);
  if (m && !history.some((h) => h !== req && normM(h.merchant) === m)) {
    score += 10;
    reasons.push(id ? "Merchant baru pertama kali" : "First-time merchant");
  }

  const sameCat = history
    .filter((h) => h !== req && h.category === req.category)
    .map((h) => num(h.amount))
    .filter((v) => v > 0);
  if (sameCat.length >= 2 && amt.greaterThan(0)) {
    const sorted = [...sameCat].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    if (med > 0 && amt.div(med).greaterThan(2)) {
      score += 20;
      reasons.push(
        id
          ? `≥2× kebiasaan ${req.category} (~${formatMoney(med)})`
          : `≥2× usual ${req.category} spend (~${formatMoney(med)})`
      );
    }
  }

  if (score === 0) {
    reasons.push(id ? "Semua pemeriksaan lolos" : "All checks passed");
  }

  const capped = Math.min(99, score);
  return { score: capped, level: capped < 35 ? "safe" : capped < 65 ? "review" : "risky", reasons };
}

/** Near-duplicate pending/sibling requests: same merchant, amount within 1%, 7-day window. */
export function findDuplicates(target: LiteReq, requests: LiteReq[]): LiteReq[] {
  const m = normM(target.merchant);
  if (!m) return [];
  const amt = num(target.amount);
  if (!(amt > 0)) return [];
  const t = new Date(target.created_at).getTime();
  if (!Number.isFinite(t)) return [];
  return requests.filter((r) => {
    if (r === target) return false;
    if (target.id && r.id && r.id === target.id) return false;
    if (r.status === "rejected") return false;
    if (normM(r.merchant) !== m) return false;
    const a = num(r.amount);
    if (Math.abs(a - amt) / amt > 0.01) return false;
    const d = new Date(r.created_at).getTime();
    return Number.isFinite(d) && Math.abs(d - t) <= 7 * 86_400_000;
  });
}

export type Forecast = {
  projected: string;
  remaining: string;
  date: string;
  onTrack: boolean;
} | null;

/** Project end-of-period spend from the 30-day burn rate. Null when unknowable. */
export function forecastSpend(
  burnRate30d: number | string,
  available: number | string,
  periodEnd: string | null | undefined,
  now: Date = new Date()
): Forecast {
  if (!periodEnd) return null;
  const burn = new Decimal(num(burnRate30d));
  if (!(burn.greaterThan(0))) return null;
  const end = new Date(periodEnd);
  if (!Number.isFinite(end.getTime()) || end.getTime() <= now.getTime()) return null;
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  const projected = burn.mul(daysLeft);
  const remaining = new Decimal(num(available)).sub(projected);
  return {
    projected: projected.toFixed(2),
    remaining: remaining.toFixed(2),
    date: periodEnd,
    onTrack: remaining.greaterThanOrEqualTo(0),
  };
}

export type AskCtx = {
  budgets: { name: string; total_amount: number | string; allocated_amount: number | string; available_amount: number | string; currency: string; period_end?: string | null }[];
  requests: { amount: number | string; category: string; status: string; merchant: string | null; created_at: string }[];
};

export type AskSuggestion = { label: string; prompt: string };

export function getAskSuggestions(lang: InsightLang = "en"): AskSuggestion[] {
  if (lang === "id") {
    return [
      { label: "Sisa anggaran", prompt: "Berapa sisa anggaran?" },
      { label: "Menunggu", prompt: "Ada berapa permintaan menunggu?" },
      { label: "Belanja groceries", prompt: "Berapa belanja groceries?" },
      { label: "Bulan ini", prompt: "Ringkasan bulan ini" },
      { label: "Top merchant", prompt: "Merchant terbesar bulan ini?" },
      { label: "Runway", prompt: "Berapa hari runway tersisa?" },
      { label: "Rekonsiliasi", prompt: "Berapa yang sudah direkonsiliasi?" },
      { label: "Risiko", prompt: "Permintaan paling berisiko?" },
    ];
  }
  return [
    { label: "Remaining", prompt: "How much budget remains?" },
    { label: "Pending", prompt: "What's pending?" },
    { label: "Groceries", prompt: "How much did we spend on groceries?" },
    { label: "This month", prompt: "Summary for this month" },
    { label: "Top merchant", prompt: "Top merchant this month?" },
    { label: "Runway", prompt: "How many days of runway left?" },
    { label: "Reconciled", prompt: "How much is reconciled?" },
    { label: "Risk", prompt: "Most risky pending request?" },
  ];
}

/**
 * Flagship answer engine: ~14 intents, covers spend, budget health, forecast,
 * runway, pending, reconciled, categories, merchants, duplicates, risk, month/week.
 * Returns null when the question matches no known intent.
 * Pure + deterministic.
 */
export function answerQuestion(q: string, ctx: AskCtx, lang: InsightLang = "en", now: Date = new Date()): string | null {
  const id = lang === "id";
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const money = (v: number) => formatMoney(v);
  const realized = ctx.requests.filter((r) => r.status === "approved" || r.status === "reconciled");
  const sum = (rs: { amount: number | string }[]) => rs.reduce((a, r) => a + num(r.amount), 0);

  const has = (...words: string[]) => words.some((w) => s.includes(w));
  const cats = [...new Set(ctx.requests.map((r) => r.category).filter(Boolean))];
  const hitCat = cats.find((c) => c && s.includes(c.toLowerCase()));

  // 1) Pending / queue
  if (has("pending", "menunggu", "antre", "queue", "awaiting")) {
    const p = ctx.requests.filter((r) => r.status === "pending");
    const dups = p.length ? p.flatMap((r) => findDuplicates(r as LiteReq, p as unknown as LiteReq[])).length : 0;
    const extra = dups > 0 ? (id ? ` ${dups} duplikat terdeteksi.` : ` ${dups} duplicate(s) flagged.`) : "";
    return id
      ? `${p.length} permintaan menunggu senilai ${money(sum(p))}.${extra}`
      : `${p.length} pending request(s) worth ${money(sum(p))}.${extra}`;
  }

  // 2) Risk / riskiest pending
  if (has("risk", "risiko", "risky", "berisiko", "review", "needs review")) {
    const pend = ctx.requests.filter((r) => r.status === "pending") as unknown as LiteReq[];
    if (pend.length === 0) return id ? "Tidak ada permintaan menunggu." : "No pending requests.";
    const withBudget = ctx.budgets[0] ?? null;
    let best: LiteReq | null = null;
    let bestScore = -1;
    let bestReasons: string[] = [];
    for (const r of pend) {
      const sc = approvalRisk(r, withBudget as unknown as { available_amount: number | string; total_amount: number | string } | null, pend, lang);
      if (sc.score > bestScore) { bestScore = sc.score; best = r; bestReasons = sc.reasons; }
    }
    if (!best) return null;
    return id
      ? `Paling berisiko: ${best.merchant ?? best.category} ${money(num(best.amount))} — skor ${bestScore} (${bestReasons.slice(0, 2).join(", ")}).`
      : `Riskiest: ${best.merchant ?? best.category} ${money(num(best.amount))} — score ${bestScore} (${bestReasons.slice(0, 2).join(", ")}).`;
  }

  // 3) Reconciled tally
  if (has("reconcil", "rekonsiliasi")) {
    const rs = ctx.requests.filter((r) => r.status === "reconciled");
    const pct = ctx.requests.length ? Math.round((rs.length / ctx.requests.length) * 100) : 0;
    return id
      ? `${rs.length} permintaan direkonsiliasi senilai ${money(sum(rs))} (${pct}% dari total).`
      : `${rs.length} reconciled request(s) worth ${money(sum(rs))} (${pct}% of all).`;
  }

  // 4) Approved tally
  if (has("approved", "disetujui")) {
    const rs = ctx.requests.filter((r) => r.status === "approved");
    return id
      ? `${rs.length} disetujui senilai ${money(sum(rs))} menunggu rekonsiliasi.`
      : `${rs.length} approved worth ${money(sum(rs))} awaiting reconciliation.`;
  }

  // 5) Rejected tally
  if (has("rejected", "ditolak")) {
    const rs = ctx.requests.filter((r) => r.status === "rejected");
    return id
      ? `${rs.length} ditolak senilai ${money(sum(rs))}.`
      : `${rs.length} rejected worth ${money(sum(rs))}.`;
  }

  // 6) Duplicates
  if (has("duplicate", "duplikat", "similar", "mirip")) {
    const pool = ctx.requests as unknown as LiteReq[];
    let dupGroups = 0;
    for (const r of pool) if (findDuplicates(r, pool).length > 0) dupGroups++;
    const uniq = Math.floor(dupGroups / 2);
    return id
      ? `${uniq} grup duplikat potensial (merchant+nominal dalam 7 hari).`
      : `${uniq} potential duplicate group(s) (same merchant + amount within 7 days).`;
  }

  // 7) Named category spend?
  if (hitCat && has("spend", "spent", "belanja", "habis", "pengeluaran", "total", "berapa", "how much", "summary", "ringkas")) {
    const rs = realized.filter((r) => r.category === hitCat);
    const monthRs = rs.filter((r) => { const d = new Date(r.created_at); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); });
    const extra = monthRs.length ? (id ? ` Bulan ini ${money(sum(monthRs))}.` : ` This month ${money(sum(monthRs))}.`) : "";
    return id
      ? `Belanja ${hitCat}: ${money(sum(rs))} dari ${rs.length} permintaan.${extra}`
      : `${hitCat} spend: ${money(sum(rs))} across ${rs.length} request(s).${extra}`;
  }

  // 8) Runway / forecast / burn rate
  if (has("runway", "burn rate", "burn", "forecast", "proyeksi", "on track", "akan habis", "days left", "hari lagi")) {
    if (ctx.budgets.length === 0) return id ? "Belum ada anggaran." : "No budgets yet.";
    const totalAvail = ctx.budgets.reduce((a, b) => a + num(b.available_amount), 0);
    // crude 30d burn from realized last 30d
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    const recent = realized.filter((r) => new Date(r.created_at) >= cutoff);
    const burn = recent.length ? sum(recent) / 30 : 0;
    if (burn <= 0) return id ? "Tidak ada belanja 30 hari — runway tidak terbatas." : "No spend in last 30 days — runway is unlimited.";
    const days = Math.floor(totalAvail / burn);
    const per = ctx.budgets[0].period_end ? (() => { const f = forecastSpend(burn, totalAvail, ctx.budgets[0].period_end ?? null, now); return f ? (id ? ` Proyeksi ${money(Number(f.projected))} hingga ${f.date} — sisa ${money(Number(f.remaining))} (${f.onTrack ? "aman" : "melebihi"}).` : ` Projected ${money(Number(f.projected))} by ${f.date} — remaining ${money(Number(f.remaining))} (${f.onTrack ? "on track" : "over"}).`) : ""; })() : "";
    return id
      ? `Runway ~${days} hari pada ${money(burn)}/hari (total tersedia ${money(totalAvail)}).${per}`
      : `Runway ~${days} day(s) at ${money(burn)}/day (total available ${money(totalAvail)}).${per}`;
  }

  // 9) Budget remaining / available / health
  if (has("remain", "sisa", "available", "tersedia", "balance", "saldo", "budget", "health", "sehat", "over budget")) {
    if (ctx.budgets.length === 0) return id ? "Belum ada anggaran." : "No budgets yet.";
    const lines = ctx.budgets.slice(0, 3).map((b) => `${b.name}: ${money(num(b.available_amount))}`);
    const totalAvail = ctx.budgets.reduce((a, b) => a + num(b.available_amount), 0);
    const totalAlloc = ctx.budgets.reduce((a, b) => a + num(b.allocated_amount), 0);
    const totalAll = ctx.budgets.reduce((a, b) => a + num(b.total_amount), 0);
    const usage = totalAll > 0 ? Math.round((totalAlloc / totalAll) * 100) : 0;
    const health = usage >= 85 ? (id ? "berisiko" : "at risk") : usage >= 60 ? (id ? "waspada" : "watch") : (id ? "sehat" : "healthy");
    return id
      ? `Sisa: ${lines.join("; ")}. Total tersedia ${money(totalAvail)} (${usage}% terpakai — ${health}).`
      : `Remaining: ${lines.join("; ")}. Total available ${money(totalAvail)} (${usage}% used — ${health}).`;
  }

  // 10) Total spend
  if (has("spend", "spent", "belanja", "habis", "pengeluaran", "total spent", "how much", "total")) {
    const month = ctx.requests.filter((r) => { const d = new Date(r.created_at); return (r.status==="approved"||r.status==="reconciled") && d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); });
    return id
      ? `Total terealisasi: ${money(sum(realized))} dari ${realized.length} permintaan. Bulan ini ${money(sum(month))}.`
      : `Total realized spend: ${money(sum(realized))} across ${realized.length} request(s). This month ${money(sum(month))}.`;
  }

  // 11) Top merchant / category / where money went
  if (has("merchant", "toko", "where", "kemana", "top", "terbesar", "most", "by category")) {
    const counts = new Map<string, number>();
    for (const r of realized) {
      const m = normM(r.merchant) || r.category;
      counts.set(m, (counts.get(m) ?? 0) + num(r.amount));
    }
    if (counts.size === 0) return id ? "Belum ada belanja." : "No spend yet.";
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const top = sorted[0];
    const rest = sorted.slice(1).map(([n,v]) => `${n} ${money(v)}`).join(", ");
    const extra = rest ? (id ? ` Lainnya: ${rest}.` : ` Others: ${rest}.`) : "";
    return id ? `Terbesar: ${top[0]} sebesar ${money(top[1])}.${extra}` : `Top: ${top[0]} at ${money(top[1])}.${extra}`;
  }

  // 12) This week / month volume
  if (has("this week", "minggu ini", "week") || has("this month", "bulan ini", "month")) {
    const isWeek = has("week", "minggu");
    let start: Date;
    if (isWeek) {
      start = new Date(now);
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const rs = ctx.requests.filter((r) => new Date(r.created_at) >= start);
    const pend = rs.filter((r) => r.status==="pending").length;
    return id
      ? `${isWeek ? "Minggu ini" : "Bulan ini"}: ${rs.length} permintaan senilai ${money(sum(rs))} (${pend} menunggu).`
      : `${isWeek ? "This week" : "This month"}: ${rs.length} request(s) worth ${money(sum(rs))} (${pend} pending).`;
  }

  // 13) Rejected / today / yesterday etc trivial fallback for pending-ish already handled
  if (has("today", "hari ini")) {
    const start = new Date(now); start.setHours(0,0,0,0);
    const rs = ctx.requests.filter((r) => new Date(r.created_at) >= start);
    return id ? `Hari ini: ${rs.length} permintaan senilai ${money(sum(rs))}.` : `Today: ${rs.length} request(s) worth ${money(sum(rs))}.`;
  }

  return null;
}
