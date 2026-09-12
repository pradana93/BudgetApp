import Decimal from "decimal.js";
import { formatMoney } from "./money";

export type InsightLang = "en" | "id";

export type LedgerPoint = {
  created_at: string;
  debit: number | string;
  credit: number | string;
  reference_type: string;
  description: string | null;
};

export type RequestPoint = {
  amount: number | string;
  category: string;
  status: string;
  created_at: string;
  merchant: string | null;
};

export type BudgetInsights = {
  movementCount: number;
  totalDebit: string;
  totalCredit: string;
  netSpend: string;
  burnRate30d: string;
  runwayDays: number | null;
  pendingExposure: string;
  pendingCount: number;
  topCategories: { name: string; total: string; count: number; share: number }[];
  largestSpend: { amount: string; label: string; date: string } | null;
  anomalies: string[];
  narrative: string[];
};

const DAY_MS = 86_400_000;

function sum(values: (number | string)[]): Decimal {
  return values.reduce((acc, v) => acc.add(new Decimal(v || 0)), new Decimal(0));
}

type Templates = {
  summary: (movements: number, out: string, inn: string, net: string) => string;
  burn: (rate: string, days: number | null, available: string) => string;
  burnZero: () => string;
  topCategory: (name: string, total: string, share: number) => string;
  pending: (count: number, exposure: string) => string;
  anomOversized: (largest: string, avg: string) => string;
  anomOver: (pending: string, available: string) => string;
  anomRunway: (days: number) => string;
  anomEmpty: () => string;
};

const TEXT: Record<InsightLang, Templates> = {
  en: {
    summary: (m, out, inn, net) => `${m} ledger movement(s): ${out} out, ${inn} in (net ${net}).`,
    burn: (rate, days, available) =>
      `30-day burn rate is ${rate}/day` + (days !== null ? `, giving ~${days} day(s) of runway on the available ${available}.` : "."),
    burnZero: () => "No spend in the last 30 days — burn rate is zero.",
    topCategory: (name, total, share) => `Top category is ${name} at ${total} (${share}% of realized spend).`,
    pending: (count, exposure) => `${count} pending request(s) could add ${exposure} of exposure once approved.`,
    anomOversized: (largest, avg) => `Largest movement (${largest}) is ≥2× the average debit (${avg}) — worth a review.`,
    anomOver: (pending, available) => `Over-committed: pending requests (${pending}) exceed available balance (${available}).`,
    anomRunway: (days) => `At the current burn rate this budget runs dry in ~${days} day(s). Consider a top-up or slowing approvals.`,
    anomEmpty: () => "No movements yet — approve and reconcile requests to generate ledger activity.",
  },
  id: {
    summary: (m, out, inn, net) => `${m} pergerakan ledger: ${out} keluar, ${inn} masuk (neto ${net}).`,
    burn: (rate, days, available) =>
      `Laju pengeluaran 30 hari adalah ${rate}/hari` + (days !== null ? `, memberi daya tahan ~${days} hari dari saldo tersedia ${available}.` : "."),
    burnZero: () => "Tidak ada belanja dalam 30 hari terakhir — laju pengeluaran nol.",
    topCategory: (name, total, share) => `Kategori teratas adalah ${name} sebesar ${total} (${share}% dari belanja terealisasi).`,
    pending: (count, exposure) => `${count} permintaan menunggu dapat menambah eksposur ${exposure} setelah disetujui.`,
    anomOversized: (largest, avg) => `Pergerakan terbesar (${largest}) ≥2× rata-rata debit (${avg}) — layak ditinjau.`,
    anomOver: (pending, available) => `Kelebihan komitmen: permintaan menunggu (${pending}) melebihi saldo tersedia (${available}).`,
    anomRunway: (days) => `Dengan laju saat ini anggaran habis dalam ~${days} hari. Pertimbangkan top-up atau perlambat persetujuan.`,
    anomEmpty: () => "Belum ada pergerakan — setujui dan rekonsiliasi permintaan untuk menghasilkan aktivitas ledger.",
  },
};

/**
 * Analyze every movement (ledger entries + requests) of a single budget.
 * Pure + deterministic: same inputs always produce the same insights.
 * `now` is injectable so tests and charts are stable.
 */
export function analyzeBudget(
  ledger: LedgerPoint[],
  requests: RequestPoint[],
  availableAmount: number | string,
  currency = "IDR",
  now: Date = new Date(),
  lang: InsightLang = "en"
): BudgetInsights {
  const t = TEXT[lang] ?? TEXT.en;
  const money = (v: number) => formatMoney(v, currency);

  const debits = ledger.map((l) => new Decimal(l.debit || 0));
  const credits = ledger.map((l) => new Decimal(l.credit || 0));
  const totalDebit = debits.reduce((a, d) => a.add(d), new Decimal(0));
  const totalCredit = credits.reduce((a, c) => a.add(c), new Decimal(0));
  const netSpend = totalDebit.sub(totalCredit);

  const cutoff = now.getTime() - 30 * DAY_MS;
  const recentDebit = sum(
    ledger.filter((l) => new Date(l.created_at).getTime() >= cutoff).map((l) => l.debit)
  );
  const burnRate = recentDebit.div(30);
  const available = new Decimal(availableAmount || 0);
  const runwayDays = burnRate.greaterThan(0) ? Math.floor(available.div(burnRate).toNumber()) : null;

  const pending = requests.filter((r) => r.status === "pending");
  const pendingExposure = sum(pending.map((r) => r.amount));

  // Spend share by category (approved + reconciled only — real money movement)
  const catMap = new Map<string, { total: Decimal; count: number }>();
  for (const r of requests) {
    if (r.status !== "approved" && r.status !== "reconciled") continue;
    const entry = catMap.get(r.category) ?? { total: new Decimal(0), count: 0 };
    entry.total = entry.total.add(new Decimal(r.amount));
    entry.count += 1;
    catMap.set(r.category, entry);
  }
  const catBase = [...catMap.values()].reduce((a, c) => a.add(c.total), new Decimal(0));
  const topCategories = [...catMap.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total.toFixed(2),
      count: v.count,
      share: catBase.greaterThan(0) ? Math.round(v.total.div(catBase).mul(100).toNumber()) : 0,
    }))
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 5);

  // Largest single debit movement
  let largest: { idx: number; value: Decimal } | null = null;
  ledger.forEach((l, idx) => {
    const d = new Decimal(l.debit || 0);
    if (d.greaterThan(0) && (!largest || d.greaterThan(largest.value))) largest = { idx, value: d };
  });
  const largestSpend = largest
    ? {
        amount: largest.value.toFixed(2),
        label: ledger[largest.idx].description || ledger[largest.idx].reference_type,
        date: ledger[largest.idx].created_at,
      }
    : null;

  const anomalies: string[] = [];
  const positiveDebits = debits.filter((d) => d.greaterThan(0));
  if (positiveDebits.length >= 3 && largest) {
    const avg = positiveDebits.reduce((a, d) => a.add(d), new Decimal(0)).div(positiveDebits.length);
    if (avg.greaterThan(0) && largest.value.div(avg).greaterThanOrEqualTo(2)) {
      anomalies.push(t.anomOversized(money(largest.value.toNumber()), money(avg.toNumber())));
    }
  }
  if (pendingExposure.greaterThan(available) && pendingExposure.greaterThan(0)) {
    anomalies.push(t.anomOver(money(pendingExposure.toNumber()), money(available.toNumber())));
  }
  if (runwayDays !== null && runwayDays <= 7 && burnRate.greaterThan(0)) {
    anomalies.push(t.anomRunway(runwayDays));
  }
  if (ledger.length === 0 && requests.length === 0) {
    anomalies.push(t.anomEmpty());
  }

  const narrative: string[] = [];
  narrative.push(t.summary(ledger.length, money(totalDebit.toNumber()), money(totalCredit.toNumber()), money(netSpend.toNumber())));
  if (burnRate.greaterThan(0)) {
    narrative.push(t.burn(money(burnRate.toNumber()), runwayDays, money(available.toNumber())));
  } else {
    narrative.push(t.burnZero());
  }
  if (topCategories.length > 0) {
    const top = topCategories[0];
    narrative.push(t.topCategory(top.name, money(Number(top.total)), top.share));
  }
  if (pending.length > 0) {
    narrative.push(t.pending(pending.length, money(pendingExposure.toNumber())));
  }

  return {
    movementCount: ledger.length,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    netSpend: netSpend.toFixed(2),
    burnRate30d: burnRate.toFixed(2),
    runwayDays,
    pendingExposure: pendingExposure.toFixed(2),
    pendingCount: pending.length,
    topCategories,
    largestSpend,
    anomalies,
    narrative,
  };
}

/** Cumulative net-spend series for charts (sorted oldest → newest). */
export function cumulativeSpendSeries(
  ledger: LedgerPoint[],
  locale: string = "en-US"
): { date: string; cumulative: number }[] {
  const sorted = [...ledger].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  let acc = new Decimal(0);
  return sorted.map((l) => {
    acc = acc.add(new Decimal(l.debit || 0)).sub(new Decimal(l.credit || 0));
    return { date: new Date(l.created_at).toLocaleDateString(locale), cumulative: acc.toNumber() };
  });
}
