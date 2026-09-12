import { describe, it, expect } from "vitest";
import { formatMoney, addMoney, subMoney, toMinorUnits, fromMinorUnits, isValidMoney } from "./money";
import Decimal from "decimal.js";

describe("money utils", () => {
  it("formatMoney IDR", () => {
    expect(formatMoney("1000000", "IDR")).toMatch(/Rp/);
  });
  it("addMoney never floats", () => {
    expect(addMoney("0.10", "0.20")).toBe("0.30");
    expect(addMoney("10000000.00", "250000.00")).toBe("10250000.00");
  });
  it("subMoney", () => {
    expect(subMoney("100.00", "0.30")).toBe("99.70");
  });
  it("minor units round-trip", () => {
    expect(toMinorUnits("123.45")).toBe(12345);
    expect(fromMinorUnits(12345).equals(new Decimal("123.45"))).toBe(true);
  });
  it("isValidMoney rejects >2 decimals and negatives", () => {
    expect(isValidMoney("10.123")).toBe(false);
    expect(isValidMoney("-1")).toBe(false);
    expect(isValidMoney("10.00")).toBe(true);
  });
  it("decimal.js precision", () => {
    // 0.1+0.2 float would be 0.30000000000000004, decimal is exact
    const d = new Decimal("0.1").add(new Decimal("0.2"));
    expect(d.toFixed(2)).toBe("0.30");
  });
});
