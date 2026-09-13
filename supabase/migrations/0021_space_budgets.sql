-- 0021_space_budgets.sql — monthly budget per personal category (idempotent)
begin;

alter table public.personal_categories add column if not exists monthly_budget numeric(14,2) check (monthly_budget is null or monthly_budget >= 0);

commit;
