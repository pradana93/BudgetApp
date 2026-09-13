import { describe, it, expect } from "vitest";
import { translate, type Lang } from "../i18n/translations";
import { analyzeBudget, budgetHealth, cumulativeSpendSeries } from "./insights";
import { achievementsFor, xpOf, duoTable, levelOf } from "./gamify";
import { suggestCategory, reconciliationScore } from "./matcher";
import { formatMoney, isValidMoney } from "./money";
import { normalizeCategory } from "../hooks/useCategories";
import { formatDate, formatDateTime, timeAgo, isOverdue } from "./datetime";

/** Hostile-but-plausible shapes: missing columns, nulls, garbage dates. */
const hostileLedger = [
  { created_at: "not-a-date", debit: null, credit: undefined, reference_type: null, description: null },
  { created_at: "", debit: "", credit: "", reference_type: "", description: "" },
] as unknown as Parameters<typeof analyzeBudget>[0];

const hostileRequests = [
  { requester_id: null, amount: "abc", category: null, status: null, created_at: "never", merchant: 42, receipt_url: 0, due_date: "yesterday" },
  {},
] as unknown as Parameters<typeof achievementsFor>[0];

describe("robustness: engines never throw on dirty data", () => {
  it("translate falls back gracefully", () => {
    expect(translate("xx" as Lang, "nope" as never)).toBe("nope");
    expect(translate("en", "dash.title", { unused: 1 })).toBe("Dashboard");
    expect(typeof translate("id", "dash.title")).toBe("string");
  });

  it("analyzeBudget + series survive garbage ledger", () => {
    const r = analyzeBudget(hostileLedger, hostileRequests, "0", "IDR", new Date("2026-09-13T00:00:00Z"));
    expect(r.movementCount).toBe(2);
    expect(Array.isArray(r.narrative)).toBe(true);
    expect(cumulativeSpendSeries(hostileLedger)).toHaveLength(2);
    expect(budgetHealth({ allocated: "", total: "", available: "", pendingExposure: "", runwayDays: null })).toBe("onTrack");
  });

  it("gamify survives missing users and fields", () => {
    const u = achievementsFor(hostileRequests, "ghost");
    expect(u).toHaveLength(8);
    expect(xpOf(hostileRequests, "ghost")).toBe(0);
    expect(duoTable(hostileRequests).length).toBeGreaterThanOrEqual(0);
    expect(levelOf(-5).level).toBe(1);
  });

  it("matcher survives empty config", () => {
    expect(suggestCategory({ merchant: "", amount: "", history: [], categories: [] })).toBe(null);
    expect(
      suggestCategory({ merchant: "", amount: "", history: [], categories: ["a", "b"], lang: "id" })?.category
    ).toBeDefined();
    const s = reconciliationScore({ amount: "", receiptUrl: null, dueDate: "garbage", available: "", knownMerchant: false });
    expect(s.score).toBeGreaterThanOrEqual(0);
  });

  it("money + datetime helpers survive garbage", () => {
    expect(formatMoney(0)).toContain("Rp");
    expect(isValidMoney("")).toBe(false);
    expect(isValidMoney("abc")).toBe(false);
    expect(normalizeCategory("")).toBe(null);
    expect(isOverdue(null, "pending")).toBe(false);
    expect(isOverdue("2000-01-01", "approved")).toBe(false);
    expect(typeof timeAgo("not-a-date", "id")).toBe("string");
    expect(typeof formatDate("2026-09-13", "en")).toBe("string");
    expect(typeof formatDateTime("2026-09-13", "id")).toBe("string");
  });
});
