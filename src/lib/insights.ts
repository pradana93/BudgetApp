import Decimal from "decimal.js";
import { formatMoney } from "./money";

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
  now: Date = new Date()
): BudgetInsights {
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
      anomalies.push(
        `Largest movement (${formatMoney(largest.value.toNumber(), currency)}) is ≥2× the average debit (${formatMoney(avg.toNumber(), currency)}) — worth a review.`
      );
    }
  }
  if (pendingExposure.greaterThan(available) && pendingExposure.greaterThan(0)) {
    anomalies.push(
      `Over-committed: pending requests (${formatMoney(pendingExposure.toNumber(), currency)}) exceed available balance (${formatMoney(available.toNumber(), currency)}).`
    );
  }
  if (runwayDays !== null && runwayDays <= 7 && burnRate.greaterThan(0)) {
    anomalies.push(`At the current burn rate this budget runs dry in ~${runwayDays} day(s). Consider a top-up or slowing approvals.`);
  }
  if (ledger.length === 0 && requests.length === 0) {
    anomalies.push("No movements yet — approve and reconcile requests to generate ledger activity.");
  }

  const narrative: string[] = [];
  narrative.push(
    `${ledger.length} ledger movement(s): ${formatMoney(totalDebit.toNumber(), currency)} out, ${formatMoney(totalCredit.toNumber(), currency)} in (net ${formatMoney(netSpend.toNumber(), currency)}).`
  );
  if (burnRate.greaterThan(0)) {
    narrative.push(
      `30-day burn rate is ${formatMoney(burnRate.toNumber(), currency)}/day` +
        (runwayDays !== null ? `, giving ~${runwayDays} day(s) of runway on the available ${formatMoney(available.toNumber(), currency)}.` : ".")
    );
  } else {
    narrative.push("No spend in the last 30 days — burn rate is zero.");
  }
  if (topCategories.length > 0) {
    const top = topCategories[0];
    narrative.push(`Top category is ${top.name} at ${formatMoney(Number(top.total), currency)} (${top.share}% of realized spend).`);
  }
  if (pending.length > 0) {
    narrative.push(`${pending.length} pending request(s) could add ${formatMoney(pendingExposure.toNumber(), currency)} of exposure once approved.`);
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
export function cumulativeSpendSeries(ledger: LedgerPoint[]): { date: string; cumulative: number }[] {
  const sorted = [...ledger].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  let acc = new Decimal(0);
  return sorted.map((l) => {
    acc = acc.add(new Decimal(l.debit || 0)).sub(new Decimal(l.credit || 0));
    return { date: new Date(l.created_at).toLocaleDateString(), cumulative: acc.toNumber() };
  });
}
