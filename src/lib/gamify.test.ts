import { describe, it, expect } from "vitest";
import { achievementsFor, xpOf, levelOf, duoTable, isUnlocked, achMeta } from "./gamify";

const D = (day: string) => `${day}T10:00:00Z`;
const R = (over: object) => ({
  requester_id: "u1",
  amount: 100000,
  category: "groceries",
  status: "pending",
  created_at: D("2026-09-01"),
  merchant: "Shop",
  receipt_url: null,
  due_date: null,
  ...over,
});

describe("achievementsFor", () => {
  it("unlocks first steps on the first request", () => {
    const [first] = achievementsFor([R({})], "u1");
    expect(first.id).toBe("first-steps");
    expect(isUnlocked(first)).toBe(true);
  });

  it("tracks receipt, early-bird and streak progress", () => {
    const reqs = [
      R({ receipt_url: "a/b.jpg", due_date: "2026-09-10", created_at: D("2026-09-01") }),
      R({ receipt_url: "a/c.jpg", due_date: "2026-09-11", created_at: D("2026-09-02") }),
      R({ receipt_url: "a/d.jpg", due_date: "2026-09-12", created_at: D("2026-09-03") }),
    ];
    const byId = Object.fromEntries(achievementsFor(reqs, "u1").map((u) => [u.id, u]));
    expect(isUnlocked(byId["early-bird"])).toBe(true); // all filed 9 days early
    expect(isUnlocked(byId["on-fire"])).toBe(true); // 3 consecutive days
    expect(byId["receipt-pro"].progress).toBe(3);
  });

  it("requires zero rejections for trusted", () => {
    const clean = Array.from({ length: 10 }, () => R({ status: "reconciled" }));
    expect(isUnlocked(achievementsFor(clean, "u1").find((u) => u.id === "trusted")!)).toBe(true);
    const dirty = [...clean.slice(0, 9), R({ status: "rejected" })];
    const t = achievementsFor(dirty, "u1").find((u) => u.id === "trusted")!;
    expect(isUnlocked(t)).toBe(false);
    expect(t.progress).toBe(0);
  });

  it("isolates users from each other", () => {
    const reqs = [R({ requester_id: "u2" })];
    expect(achievementsFor(reqs, "u1")[0].progress).toBe(0);
  });
});

describe("xp and levels", () => {
  it("rewards habits, not spending", () => {
    const xp = xpOf(
      [R({ receipt_url: "x", status: "reconciled" }), R({})],
      "u1"
    );
    expect(xp).toBe(10 + 5 + 10 + 10 + 10); // filed+receipt+approved+reconciled, then plain filed
  });

  it("levels up on a gentle curve", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, span: 100 });
    expect(levelOf(100)).toEqual({ level: 2, into: 0, span: 200 });
    expect(levelOf(250)).toEqual({ level: 2, into: 150, span: 200 });
  });

  it("ranks the duo", () => {
    const table = duoTable([R({ requester_id: "u1" }), R({ requester_id: "u2", status: "reconciled", receipt_url: "x" })]);
    expect(table[0].userId).toBe("u2");
    expect(table.reduce((s, r) => s + r.xp, 0)).toBe(45); // 10 filed + 35 filed+receipt+reconciled
  });

  it("names achievements in both languages", () => {
    expect(achMeta("on-fire", "en").name).toBe("On Fire");
    expect(achMeta("on-fire", "id").name).toBe("Menyala");
  });
});
