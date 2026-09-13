import { describe, it, expect } from "vitest";
import { approvalRisk, findDuplicates, forecastSpend, answerQuestion } from "./advisor";

const NOW = new Date("2026-09-13T12:00:00Z");
const BUDGET = { available_amount: 1000000, total_amount: 2000000 };

describe("approvalRisk", () => {
  it("flags over-budget, receiptless, unknown merchants as risky", () => {
    const r = approvalRisk(
      { merchant: "Brand New Shop", amount: 1500000, category: "groceries", status: "pending", created_at: "2026-09-13T10:00:00Z" },
      BUDGET,
      [],
      "en"
    );
    expect(r.level).toBe("risky");
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("calls a receipted, known, affordable request safe", () => {
    const history = [{ merchant: "Shell", amount: 100000, category: "transport", status: "reconciled", created_at: "2026-09-01T10:00:00Z" }];
    const r = approvalRisk(
      { merchant: "shell", amount: 100000, category: "transport", status: "pending", created_at: "2026-09-13T10:00:00Z", receipt_url: "a/b.jpg" },
      BUDGET,
      history,
      "en"
    );
    expect(r.level).toBe("safe");
    expect(r.score).toBe(0);
  });

  it("explains in Bahasa Indonesia", () => {
    const r = approvalRisk(
      { merchant: "X", amount: 9999999, category: "groceries", status: "pending", created_at: "2026-09-13T10:00:00Z" },
      BUDGET,
      [],
      "id"
    );
    expect(r.reasons.some((x) => x.includes("saldo tersedia"))).toBe(true);
  });
});

describe("findDuplicates", () => {
  const base = { merchant: "Indomaret", amount: 150000, category: "groceries", status: "pending", created_at: "2026-09-13T10:00:00Z" };
  it("matches same merchant+amount within days, ignores the rest", () => {
    const target = { ...base, id: "t" };
    const pool = [
      { ...base, id: "d1", created_at: "2026-09-12T10:00:00Z" }, // dup
      { ...base, id: "d2", created_at: "2026-08-01T10:00:00Z" }, // too old
      { ...base, id: "d3", amount: 200000, created_at: "2026-09-12T10:00:00Z" }, // different amount
      { ...base, id: "d4", status: "rejected", created_at: "2026-09-12T10:00:00Z" }, // rejected ignored
      { ...base, id: "t", created_at: "2026-09-13T10:00:00Z" }, // self ignored
    ];
    expect(findDuplicates(target, pool).map((r) => r.id)).toEqual(["d1"]);
  });

  it("needs a merchant and amount", () => {
    expect(findDuplicates({ ...base, merchant: null }, [base])).toEqual([]);
    expect(findDuplicates({ ...base, amount: 0 }, [base])).toEqual([]);
  });
});

describe("forecastSpend", () => {
  it("projects runway math and flags over-budget", () => {
    const ok = forecastSpend(10000, 600000, "2026-10-13", NOW);
    expect(ok?.projected).toBe("300000.00");
    expect(ok?.onTrack).toBe(true);
    const over = forecastSpend(100000, 100000, "2026-10-13", NOW);
    expect(over?.onTrack).toBe(false);
  });

  it("returns null when unknowable", () => {
    expect(forecastSpend(0, 100, "2026-10-13", NOW)).toBe(null);
    expect(forecastSpend(100, 100, null, NOW)).toBe(null);
    expect(forecastSpend(100, 100, "2020-01-01", NOW)).toBe(null);
  });
});

describe("answerQuestion", () => {
  const ctx = {
    budgets: [{ name: "House", total_amount: 1000000, allocated_amount: 200000, available_amount: 800000, currency: "IDR" }],
    requests: [
      { amount: 100000, category: "groceries", status: "pending", merchant: "Toko", created_at: "2026-09-13T10:00:00Z" },
      { amount: 200000, category: "groceries", status: "reconciled", merchant: "Toko", created_at: "2026-09-01T10:00:00Z" },
    ],
  };
  it("answers pending, spend, remaining and unknown", () => {
    expect(answerQuestion("how many pending?", ctx, "en", NOW)).toContain("1 pending");
    expect(answerQuestion("berapa yang menunggu?", ctx, "id", NOW)).toContain("menunggu");
    expect(answerQuestion("total spend?", ctx, "en", NOW)).toContain("200.000");
    expect(answerQuestion("sisa budget?", ctx, "id", NOW)).toContain("800.000");
    expect(answerQuestion("groceries spend?", ctx, "en", NOW)).toContain("groceries");
    expect(answerQuestion("what is the meaning of life?", ctx, "en", NOW)).toBe(null);
    expect(answerQuestion("", ctx, "en", NOW)).toBe(null);
  });
});
