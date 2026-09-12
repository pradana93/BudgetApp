import { describe, it, expect } from "vitest";
import { analyzeBudget, cumulativeSpendSeries } from "./insights";

const NOW = new Date("2026-09-12T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("analyzeBudget", () => {
  it("totals debits, credits and net", () => {
    const r = analyzeBudget(
      [
        { created_at: daysAgo(2), debit: 250000, credit: 0, reference_type: "reimbursement", description: "Groceries" },
        { created_at: daysAgo(1), debit: 0, credit: 1000000, reference_type: "budget_allocation", description: "Top-up" },
      ],
      [],
      500000,
      "IDR",
      NOW
    );
    expect(r.totalDebit).toBe("250000.00");
    expect(r.totalCredit).toBe("1000000.00");
    expect(r.netSpend).toBe("-750000.00");
    expect(r.movementCount).toBe(2);
  });

  it("computes 30d burn rate and runway", () => {
    const r = analyzeBudget(
      [{ created_at: daysAgo(10), debit: 300000, credit: 0, reference_type: "reimbursement", description: "x" }],
      [],
      600000,
      "IDR",
      NOW
    );
    expect(r.burnRate30d).toBe("10000.00"); // 300000 / 30
    expect(r.runwayDays).toBe(60); // 600000 / 10000
  });

  it("ignores movements older than 30d for burn, null runway when no burn", () => {
    const r = analyzeBudget(
      [{ created_at: daysAgo(60), debit: 999999, credit: 0, reference_type: "reimbursement", description: "old" }],
      [],
      100,
      "IDR",
      NOW
    );
    expect(r.burnRate30d).toBe("0.00");
    expect(r.runwayDays).toBe(null);
  });

  it("flags oversized movement and over-commitment", () => {
    const r = analyzeBudget(
      [
        { created_at: daysAgo(3), debit: 100000, credit: 0, reference_type: "reimbursement", description: "a" },
        { created_at: daysAgo(2), debit: 100000, credit: 0, reference_type: "reimbursement", description: "b" },
        { created_at: daysAgo(1), debit: 100000, credit: 0, reference_type: "reimbursement", description: "c" },
        { created_at: daysAgo(1), debit: 900000, credit: 0, reference_type: "reimbursement", description: "big" },
      ],
      [{ amount: 500000, category: "groceries", status: "pending", created_at: daysAgo(1), merchant: "X" }],
      100000,
      "IDR",
      NOW
    );
    expect(r.anomalies.some((a) => a.includes("≥2×"))).toBe(true);
    expect(r.anomalies.some((a) => a.includes("Over-committed"))).toBe(true);
    expect(r.pendingExposure).toBe("500000.00");
    expect(r.pendingCount).toBe(1);
  });

  it("ranks top categories by realized spend only", () => {
    const r = analyzeBudget(
      [],
      [
        { amount: 700000, category: "groceries", status: "reconciled", created_at: daysAgo(1), merchant: "A" },
        { amount: 300000, category: "transport", status: "approved", created_at: daysAgo(1), merchant: "B" },
        { amount: 999999, category: "dining", status: "pending", created_at: daysAgo(1), merchant: "C" },
      ],
      0,
      "IDR",
      NOW
    );
    expect(r.topCategories.map((c) => c.name)).toEqual(["groceries", "transport"]);
    expect(r.topCategories[0].share).toBe(70);
  });

  it("builds cumulative series in chronological order", () => {    const series = cumulativeSpendSeries([
      { created_at: daysAgo(1), debit: 100, credit: 0, reference_type: "reimbursement", description: null },
      { created_at: daysAgo(5), debit: 0, credit: 1000, reference_type: "budget_allocation", description: null },
      { created_at: daysAgo(3), debit: 200, credit: 0, reference_type: "reimbursement", description: null },
    ]);
    expect(series.map((p) => p.cumulative)).toEqual([-1000, -800, -700]);
  });

  it("narrates in Bahasa Indonesia when lang is id", () => {
    const r = analyzeBudget(
      [{ created_at: daysAgo(2), debit: 250000, credit: 0, reference_type: "reimbursement", description: "Groceries" }],
      [{ amount: 50000, category: "groceries", status: "pending", created_at: daysAgo(1), merchant: "X" }],
      10000,
      "IDR",
      NOW,
      "id"
    );
    expect(r.narrative[0]).toContain("pergerakan ledger");
    expect(r.narrative.some((n) => n.includes("Laju pengeluaran"))).toBe(true);
    expect(r.anomalies.some((a) => a.includes("Kelebihan komitmen"))).toBe(true);
    // numbers stay identical across languages
    expect(r.totalDebit).toBe("250000.00");
    expect(r.pendingExposure).toBe("50000.00");
  });
});
