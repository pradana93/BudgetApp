import { z } from "zod";
import { isValidMoney } from "@/lib/money";

export const budgetSchema = z.object({
  name: z.string().min(1, "Name required").max(200),
  total_amount: z.string().refine((v) => isValidMoney(v), "Invalid amount (must be >= 0 with max 2 decimals)"),
  currency: z.string().length(3).default("IDR"),
  period_start: z.string().optional().nullable(),
  period_end: z.string().optional().nullable(),
}).refine((d) => !d.period_start || !d.period_end || d.period_end >= d.period_start, { message: "End must be >= start", path: ["period_end"] });

export const requestSchema = z.object({
  budget_id: z.string().uuid("Budget required"),
  amount: z.string().min(1).refine((v) => isValidMoney(v) && Number(v) > 0, "Must be > 0 with max 2 decimals"),
  category: z.enum(["groceries","transport","dining","utilities","health","other"]),
  merchant: z.string().max(200).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});
