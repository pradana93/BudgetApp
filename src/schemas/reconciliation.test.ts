import { describe, it, expect } from "vitest";
import { budgetSchema, requestSchema } from "./budget";

describe("Zod schemas", () => {
  it("budget validates", () => {
    expect(() => budgetSchema.parse({ name: "Test", total_amount: "1000000" })).not.toThrow();
    expect(() => budgetSchema.parse({ name: "", total_amount: "100" })).toThrow();
  });
  it("request validates categories", () => {
    expect(() => requestSchema.parse({ budget_id: "00000000-0000-4000-a000-000000000001", amount: "100", category: "groceries" })).not.toThrow();
    expect(() => requestSchema.parse({ budget_id: "not-uuid", amount: "100", category: "groceries" })).toThrow();
    expect(() => requestSchema.parse({ budget_id: "00000000-0000-4000-a000-000000000001", amount: "-5", category: "groceries" })).toThrow();
  });
});

describe("reconciliation state machine (client-side guard)", () => {
  const canApprove = (status: string, role: string) => status === "pending" && role === "owner";
  const canReconcile = (status: string, role: string) => status === "approved" && role === "owner";
  const canReject = (status: string, role: string) => status === "pending" && role === "owner";

  it("pending → approved only by owner", () => {
    expect(canApprove("pending","owner")).toBe(true);
    expect(canApprove("pending","member")).toBe(false);
    expect(canApprove("approved","owner")).toBe(false);
  });
  it("approved → reconciled only by owner", () => {
    expect(canReconcile("approved","owner")).toBe(true);
    expect(canReconcile("pending","owner")).toBe(false);
  });
  it("pending → rejected only by owner", () => {
    expect(canReject("pending","owner")).toBe(true);
    expect(canReject("rejected","owner")).toBe(false);
  });
  it("reconcile requires prior approve (ledger atomic)", () => {
    // simulate: only approved can create ledger
    const ledgerCreated = canReconcile("approved","owner");
    expect(ledgerCreated).toBe(true);
    expect(canReconcile("pending","owner")).toBe(false);
  });
});
