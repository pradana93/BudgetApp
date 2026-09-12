# BudgetApp — Private 2-user Budgeting & Reconciliation

Xero-inspired, simplified for personal use. Owner allocates budgets, member submits reimbursement requests with receipts, owner approves/rejects/reconciles, ledger is append-only.

## Stack
React 18 + TS + Vite, Tailwind + shadcn/ui, TanStack Query + Zustand, RHF+Zod, React Router v6, Supabase (Postgres RLS Auth Storage Realtime), Vercel.

## Quick start
```bash
npm install
cp .env.example .env.local  # set VITE_SUPABASE_URL and ANON_KEY
npm run dev
```

## Supabase
```bash
supabase link --project-ref frxzokdrpvdqcmbkjwcw
supabase db push
supabase gen types typescript --project-id frxzokdrpvdqcmbkjwcw > src/types/supabase.ts
```

Seed: `supabase/migrations/0005_seed.sql` creates `owner@budgetapp.local` / `member@budgetapp.local` placeholders.

## Tests
```bash
npm test          # vitest (money, schemas, state machine)
npx playwright test
```

## Deploy
Vercel auto-deploys `main`. Set env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in Vercel dashboard.

See `docs/REPORT.md` for full handoff.
