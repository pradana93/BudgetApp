# BudgetApp — Execution Plan

> **Owner:** Senior Full-Stack Engineer + DevOps Agent (autonomous)
> **Repo:** https://github.com/pradana93/BudgetApp
> **Supabase URL:** https://frxzokdrpvdqcmbkjwcw.supabase.co (`frxzokdrpvdqcmbkjwcw`)
> **Linked local ref (supabase/.temp):** `ozhuxjkdoijdtyxnuium` — will reconcile to target ref during Phase 2
> **Date:** 2026-09-12
> **Branch strategy:** `dev` → PR → `main` → Vercel prod

---

## 0. Architecture Overview

```
[Vercel CDN] ──▶ React 18 + Vite (TS, Tailwind, shadcn/ui)
                    ├── TanStack Query (server state)
                    ├── Zustand (UI state)
                    ├── React Hook Form + Zod
                    └── React Router v6
                          │
                          ▼
               Supabase (frxzokdrpvdqcmbkjwcw)
                    ├── Postgres + RLS
                    ├── Auth (email+password)
                    ├── Storage (receipts bucket, private)
                    └── Realtime (budgets, requests)
```

---

## 1. Phases, Tasks, Dependencies, Done-Criteria

### Phase 0 — Recon & Safety
| # | Task | Owner | Depends | Done when |
|---|------|-------|---------|-----------|
| 0.1 | Verify `gh auth status` & `supabase --version` | agent | — | logs captured |
| 0.2 | Check `supabase projects list` / `supabase login` | agent | 0.1 | authenticated or documented blocker |
| 0.3 | Clone / link repo `pradana93/BudgetApp` | agent | 0.1 | `git remote -v` points to BudgetApp |
| 0.4 | Create `dev` branch off `main` (or initial commit if empty) | agent | 0.3 | `git branch` shows dev |
| 0.5 | Write `docs/PLAN.md` (this file) & commit | agent | 0.3 | file exists, committed |

- [x] 0.1 done — gh authenticated as pradana93, supabase 2.117.0, vercel missing (install via npx)
- [ ] 0.2 supabase login requires SUPABASE_ACCESS_TOKEN — will attempt with env, else document blocker
- [ ] 0.3 wire git remote
- [ ] 0.4 create dev
- [ ] 0.5 commit plan

### Phase 1 — Local Scaffold
| # | Task | Owner | Depends | Done when |
|---|------|-------|---------|-----------|
| 1.1 | `npm create vite@latest . -- --template react-ts` (or init if dir non-empty) | agent | 0 | vite.config.ts exists |
| 1.2 | Install deps: tailwind, supabase-js, tanstack-query, zustand, router, RHF, zod, resolvers, lucide, recharts, date-fns, decimal.js | agent | 1.1 | package.json deps present |
| 1.3 | Tailwind init + config, index.css | agent | 1.2 | `npx tailwindcss -v` works, build passes |
| 1.4 | shadcn/ui init + add components: button card input dialog table badge tabs select textarea toast dropdown-menu avatar form label separator | agent | 1.3 | src/components/ui/* exists |
| 1.5 | Env: `.env.local` with VITE_SUPABASE_URL + ANON_KEY (fetch via `supabase projects api-keys` or placeholder) | agent | 0.2 | file exists, .gitignore covers .env* |
| 1.6 | `supabase init` + `supabase link --project-ref frxzokdrpvdqcmbkjwcw` | agent | 0.2 | supabase/config.toml present |

- [ ] 1.1–1.6

### Phase 2 — Database via Supabase CLI
| # | Task | Owner | Depends | Done when |
|---|------|-------|---------|-----------|
| 2.1 | Migration `0001_init.sql` — profiles, budgets, reimbursement_requests, reconciliations, ledger_entries | agent | 1.6 | SQL is idempotent |
| 2.2 | Migration `0002_rls.sql` — enable RLS + policies (owner full, member scoped) | agent | 2.1 | no table without RLS |
| 2.3 | Migration `0003_functions.sql` — `approve_request`, `reject_request`, `reconcile_request`, balance trigger, ledger append-only | agent | 2.1 | functions atomic, tested |
| 2.4 | Migration `0004_storage.sql` — receipts bucket + storage policies | agent | 2.2 | bucket private, signed URLs |
| 2.5 | Migration `0005_seed.sql` — owner=owner@budgetapp.local / member=member@budgetapp.local placeholders | agent | 2.1 | seed idempotent |
| 2.6 | `supabase db push` (or `supabase migration up` + remote apply) | agent | 2.1–2.5 | remote DB matches |
| 2.7 | `supabase gen types typescript` → `src/types/supabase.ts` | agent | 2.6 | types generated |

- [ ] 2.1–2.7

### Phase 3 — Application Code
| # | Task | Owner | Depends | Done when |
|---|------|-------|---------|-----------|
| 3.1 | `src/lib/supabase.ts` + `src/lib/money.ts` (decimal.js) + `src/lib/utils.ts` | agent | 1.2 | client works |
| 3.2 | Auth context + `useSession` + protected routes (`/login` public, rest private) | agent | 3.1 | role-gated nav |
| 3.3 | Zod schemas shared (`src/schemas/*`) | agent | 1.2 | validated forms |
| 3.4 | Layout: sidebar nav, Xero-inspired design | agent | 3.2 | responsive |
| 3.5 | Budgets feature: list, create (owner-only), detail + ledger table + export CSV | agent | 3.1 | CRUD via Query |
| 3.6 | Requests feature: list, new+upload, detail + approve/reject/reconcile | agent | 3.5 | role-gated actions |
| 3.7 | Reconciliation: call `reconcile_request` RPC, show ledger | agent | 3.6 | atomic ledger |
| 3.8 | Dashboard: budget cards, pending count, spend chart (Recharts) | agent | 3.5/3.6 | data live |
| 3.9 | Settings: profile, currency, sign out | agent | 3.2 | works |

- [ ] 3.1–3.9

### Phase 4 — Realtime & Polish
| # | Task | Owner | Depends | Done when |
|---|------|-------|---------|-----------|
| 4.1 | Realtime subscriptions on `budgets` & `reimbursement_requests` | agent | 3 | live updates |
| 4.2 | Toasts for mutations, optimistic updates on approve/reject | agent | 3 | UX polish |
| 4.3 | Empty states, skeletons, error boundaries | agent | 3 | no blank screens |

- [ ] 4.1–4.3

### Phase 5 — Testing
| # | Task | Owner | Depends | Done when |
|---|------|-------|---------|-----------|
| 5.1 | Vitest: money utils, state machine (pending→approved→reconciled, pending→rejected), Zod | agent | 3 | `npm test` green |
| 5.2 | Playwright smoke E2E: login → create budget → submit request → approve → reconcile → ledger | agent | 3 | `npx playwright test` green |

- [ ] 5.1–5.2 — must pass before deploy

### Phase 6 — CI/CD & Deploy
| # | Task | Owner | Depends | Done when |
|---|------|-------|---------|-----------|
| 6.1 | Add `.github/workflows/ci.yml` (lint, typecheck, test) | agent | 5 | CI green |
| 6.2 | Commit conventional commits, `git push -u origin dev`, `gh pr create` | agent | 6.1 | PR open |
| 6.3 | Wait CI, `gh pr merge --squash --auto` | agent | 6.2 | merged to main |
| 6.4 | `vercel link` + `vercel --prod` or GitHub integration + `vercel env add` | agent | 6.3 | prod URL 200 |
| 6.5 | Verify prod login works, set env vars | agent | 6.4 | manual check |

- [ ] 6.1–6.5

### Deliverables
| # | Deliverable | Path |
|---|-------------|------|
| D1 | PLAN.md (this file) | `docs/PLAN.md` |
| D2 | EXECUTION_LOG.md | `docs/EXECUTION_LOG.md` |
| D3 | REPORT.md | `docs/REPORT.md` |

---

## 2. Hard Rules Compliance

- RLS on every table before any data
- Money = numeric(14,2) + decimal.js, never float
- Ledger append-only (REVOKE UPDATE/DELETE)
- All money writes via Postgres functions
- Idempotent migrations (IF NOT EXISTS)
- No secrets in repo (.env* gitignored)

---

## 3. Risks / Blockers

- Supabase project ref mismatch: `docs` says frxzokdr... but local link is ozhux... — will try frxz, fallback to linked if token missing
- No SUPABASE_ACCESS_TOKEN in env — will attempt `supabase login` and document if interactive required
- Vercel CLI not installed — use `npx vercel`
- Repo `pradana93/BudgetApp` is empty — initial commit will be this scaffold

---

## 4. Timeline (single session, autonomous)

Phase 0 → Phase 6 sequentially, no confirmation gates. Log after each phase to `docs/EXECUTION_LOG.md`.
