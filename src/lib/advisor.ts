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
  budgets: { name: string; total_amount: number | string; allocated_amount: number | string; available_amount: number | string; currency: string }[];
  requests: { amount: number | string; category: string; status: string; merchant: string | null; created_at: string }[];
};

/**
 * Answer plain-language money questions from live data (EN + ID keywords).
 * Returns null when the question matches no known intent.
 */
export function answerQuestion(q: string, ctx: AskCtx, lang: InsightLang = "en", now: Date = new Date()): string | null {
  const id = lang === "id";
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const money = (v: number) => formatMoney(v);
  const realized = ctx.requests.filter((r) => r.status === "approved" || r.status === "reconciled");
  const sum = (rs: { amount: number | string }[]) => rs.reduce((a, r) => a + num(r.amount), 0);

  const has = (...words: string[]) => words.some((w) => s.includes(w));

  // Pending / queue
  if (has("pending", "menunggu", "antre", "queue")) {
    const p = ctx.requests.filter((r) => r.status === "pending");
    return id
      ? `${p.length} permintaan menunggu senilai ${money(sum(p))}.`
      : `${p.length} pending request(s) worth ${money(sum(p))}.`;
  }

  // Named category mentioned?
  const cats = [...new Set(ctx.requests.map((r) => r.category).filter(Boolean))];
  const hitCat = cats.find((c) => c && s.includes(c.toLowerCase()));
  if (hitCat && has("spend", "spent", "belanja", "habis", "pengeluaran", "total", "berapa", "how much")) {
    const rs = realized.filter((r) => r.category === hitCat);
    return id
      ? `Belanja ${hitCat}: ${money(sum(rs))} dari ${rs.length} permintaan.`
      : `${hitCat} spend: ${money(sum(rs))} across ${rs.length} request(s).`;
  }

  // Total spend
  if (has("spend", "spent", "belanja", "habis", "pengeluaran", "total spent", "how much")) {
    return id
      ? `Total terealisasi: ${money(sum(realized))} dari ${realized.length} permintaan.`
      : `Total realized spend: ${money(sum(realized))} across ${realized.length} request(s).`;
  }

  // Budget remaining / available
  if (has("remain", "sisa", "available", "tersedia", "balance", "saldo", "budget")) {
    if (ctx.budgets.length === 0) return id ? "Belum ada anggaran." : "No budgets yet.";
    const lines = ctx.budgets.slice(0, 3).map((b) => `${b.name}: ${money(num(b.available_amount))}`);
    const totalAvail = ctx.budgets.reduce((a, b) => a + num(b.available_amount), 0);
    return id
      ? `Sisa: ${lines.join("; ")}. Total tersedia ${money(totalAvail)}.`
      : `Remaining: ${lines.join("; ")}. Total available ${money(totalAvail)}.`;
  }

  // Top merchant
  if (has("merchant", "toko", "where", "kemana", "top")) {
    const counts = new Map<string, number>();
    for (const r of realized) {
      const m = normM(r.merchant) || r.category;
      counts.set(m, (counts.get(m) ?? 0) + num(r.amount));
    }
    if (counts.size === 0) return id ? "Belum ada belanja." : "No spend yet.";
    const [name, total] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return id ? `Terbesar: ${name} sebesar ${money(total)}.` : `Top: ${name} at ${money(total)}.`;
  }

  // Reconciled tally
  if (has("reconcil", "rekonsiliasi")) {
    const rs = ctx.requests.filter((r) => r.status === "reconciled");
    return id
      ? `${rs.length} permintaan direkonsiliasi senilai ${money(sum(rs))}.`
      : `${rs.length} reconciled request(s) worth ${money(sum(rs))}.`;
  }

  // This week / month volume
  if (has("this week", "minggu ini", "week")) {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    const rs = ctx.requests.filter((r) => new Date(r.created_at) >= start);
    return id
      ? `Minggu ini: ${rs.length} permintaan senilai ${money(sum(rs))}.`
      : `This week: ${rs.length} request(s) worth ${money(sum(rs))}.`;
  }

  return null;
}
