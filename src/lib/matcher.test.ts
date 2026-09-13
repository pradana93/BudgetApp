import { describe, it, expect } from "vitest";
import { suggestCategory, reconciliationScore } from "./matcher";

const CATS = ["groceries", "transport", "dining", "utilities", "health", "other"];

describe("suggestCategory", () => {
  it("remembers merchant history and auto-picks", () => {
    const s = suggestCategory({
      merchant: "Shell Gas Station",
      amount: "100000",
      history: [
        { merchant: "shell gas station", category: "transport", amount: 90000 },
        { merchant: "Shell Gas Station", category: "transport", amount: 110000 },
      ],
      categories: CATS,
    });
    expect(s?.category).toBe("transport");
    expect(s!.confidence).toBeGreaterThanOrEqual(90);
    expect(s?.auto).toBe(true);
    expect(s?.reasons[0]).toContain("2×");
  });

  it("uses keyword rules for unknown merchants", () => {
    const s = suggestCategory({
      merchant: "Indomaret Baru",
      amount: "",
      history: [],
      categories: CATS,
    });
    expect(s?.category).toBe("groceries");
    expect(s?.confidence).toBe(80);
    expect(s?.auto).toBe(false);
  });

  it("falls back to amount habits, then most-used, then default", () => {
    const near = suggestCategory({
      merchant: "Somewhere New",
      amount: "105000",
      history: [{ merchant: "X", category: "dining", amount: 100000 }],
      categories: CATS,
    });
    expect(near?.category).toBe("dining");
    expect(near?.confidence).toBe(55);

    const freq = suggestCategory({
      merchant: "Somewhere New",
      amount: "9999999",
      history: [
        { merchant: "A", category: "health", amount: 10 },
        { merchant: "B", category: "health", amount: 20 },
      ],
      categories: CATS,
    });
    expect(freq?.category).toBe("health");

    const empty = suggestCategory({ merchant: "", amount: "", history: [], categories: CATS });
    expect(empty?.category).toBe("other");
  });

  it("ignores categories removed by the owner", () => {
    const s = suggestCategory({
      merchant: "Shell",
      amount: "",
      history: [],
      categories: ["groceries", "other"],
    });
    // transport was removed → keyword must not suggest it
    expect(["groceries", "other"]).toContain(s?.category);
    expect(s?.category).not.toBe("transport");
  });

  it("explains in Bahasa Indonesia when asked", () => {
    const s = suggestCategory({
      merchant: "Klinik Sehat",
      amount: "",
      history: [],
      categories: CATS,
      lang: "id",
    });
    expect(s?.category).toBe("health");
    expect(s?.reasons[0]).toContain("Kata kunci");
  });
});

describe("reconciliationScore", () => {
  it("scores a perfect candidate near the top", () => {
    const r = reconciliationScore({
      amount: 150000,
      receiptUrl: "a/b/c.jpg",
      dueDate: null,
      available: 1000000,
      knownMerchant: true,
    });
    expect(r.score).toBe(99); // 10+40+25+20+5 capped
    expect(r.warnings).toEqual([]);
  });

  it("penalizes missing receipt, unknown merchant and over-budget", () => {
    const r = reconciliationScore({
      amount: 2000000,
      receiptUrl: null,
      dueDate: "2000-01-01",
      available: 100000,
      knownMerchant: false,
    });
    expect(r.score).toBeLessThan(40);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });
});
