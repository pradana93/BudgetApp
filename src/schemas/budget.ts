import { z } from "zod";
import { isValidMoney } from "@/lib/money";

export type BudgetMessages = {
  nameRequired?: string;
  invalidAmount?: string;
  endGteStart?: string;
  budgetRequired?: string;
  amountGt?: string;
  categoryRequired?: string;
};

const fb = (v: string | undefined, fallback: string) => v ?? fallback;

export function getBudgetSchema(m: BudgetMessages = {}) {
  return z.object({
    name: z.string().min(1, fb(m.nameRequired, "Name required")).max(200),
    total_amount: z.string().refine((v) => isValidMoney(v), fb(m.invalidAmount, "Invalid amount (must be >= 0 with max 2 decimals)")),
    currency: z.string().length(3).default("IDR"),
    period_start: z.string().optional().nullable(),
    period_end: z.string().optional().nullable(),
  }).refine((d) => !d.period_start || !d.period_end || d.period_end >= d.period_start, { message: fb(m.endGteStart, "End must be >= start"), path: ["period_end"] });
}

export const budgetSchema = getBudgetSchema();

export function getRequestSchema(m: BudgetMessages = {}) {
  return z.object({
    budget_id: z.string().uuid(fb(m.budgetRequired, "Budget required")),
    amount: z.string().min(1).refine((v) => isValidMoney(v) && Number(v) > 0, fb(m.amountGt, "Must be > 0 with max 2 decimals")),
    category: z.string().min(1, fb(m.categoryRequired, "Category required")),
    merchant: z.string().max(200).optional().nullable(),
    description: z.string().max(1000).optional().nullable(),
    due_date: z.string().optional().nullable(),
  });
}

export const requestSchema = getRequestSchema();
