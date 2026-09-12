import Decimal from "decimal.js";

/** Format numeric(14,2) value for display. Never use float arithmetic. */
export function formatMoney(value: string | number | Decimal, currency = "IDR"): string {
  const d = new Decimal(value);
  return new Intl.NumberFormat(currency === "IDR" ? "id-ID" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(d.toNumber());
}

export function toMinorUnits(amount: string | number): number {
  return new Decimal(amount).mul(100).toNumber();
}

export function fromMinorUnits(minor: number): Decimal {
  return new Decimal(minor).div(100);
}

export function addMoney(a: string | number, b: string | number): string {
  return new Decimal(a).add(new Decimal(b)).toFixed(2);
}

export function subMoney(a: string | number, b: string | number): string {
  return new Decimal(a).sub(new Decimal(b)).toFixed(2);
}

// validation helper for Zod
export function isValidMoney(v: string): boolean {
  try {
    const d = new Decimal(v);
    return d.greaterThanOrEqualTo(0) && d.decimalPlaces() <= 2;
  } catch { return false; }
}
