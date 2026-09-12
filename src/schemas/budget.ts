import { z } from "zod";
export const budgetSchema = z.object({
  name: z.string().min(1, "Name required").max(200),
  total_amount: z.string().refine((v) => { try { const n = Number(v); return !isNaN(n) && n >= 0 && Number(v).toString().split(".")[1]?.length !== undefined ? Number(v).toString().split(".")[1].length <= 2 : true; } catch { return false; } }, "Invalid amount"),
  currency: z.string().length(3).default("IDR"),
  period_start: z.string().optional().nullable(),
  period_end: z.string().optional().nullable(),
}).refine((d) => !d.period_start || !d.period_end || d.period_end >= d.period_start, { message: "End must be >= start", path: ["period_end"] });

export const requestSchema = z.object({
  budget_id: z.string().uuid("Budget required"),
  amount: z.string().min(1).refine((v) => { const n = Number(v); return !isNaN(n) && n > 0; }, "Must be >0"),
  category: z.enum(["groceries","transport","dining","utilities","health","other"]),
  merchant: z.string().max(200).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});
