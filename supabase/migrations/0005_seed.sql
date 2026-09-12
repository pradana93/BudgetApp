-- 0005_seed.sql — placeholder profiles (idempotent)
-- NOTE: Real users must be created via Supabase Auth (email+password).
-- This seed inserts profile placeholders with FIXED UUIDs so FKs can be tested locally.
-- In production, the handle_new_user() trigger creates profiles on signup.
begin;

-- Fixed UUIDs for local dev/testing (do not use in prod auth)
-- owner@budgetapp.local  -> 00000000-0000-4000-a000-000000000001
-- member@budgetapp.local -> 00000000-0000-4000-a000-000000000002

-- We cannot insert into auth.users without service_role, so we only seed profiles
-- with ON CONFLICT DO NOTHING; actual auth creation is manual (see docs/REPORT.md).

insert into public.profiles (id, email, display_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'owner@budgetapp.local', 'Owner', 'owner'),
  ('00000000-0000-4000-a000-000000000002', 'member@budgetapp.local', 'Member', 'member')
on conflict (id) do update set email = excluded.email, role = excluded.role;

-- Seed a demo budget owned by owner (if not exists)
insert into public.budgets (id, owner_id, name, total_amount, currency, period_start, period_end, status)
values (
  '00000000-0000-4000-a000-000000000010',
  '00000000-0000-4000-a000-000000000001',
  'Household — Demo 2026',
  10000000,
  'IDR',
  date_trunc('month', now())::date,
  (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  'active'
) on conflict (id) do nothing;

-- Seed a pending demo request (member -> demo budget)
insert into public.reimbursement_requests (id, budget_id, requester_id, amount, category, merchant, description, status)
values (
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000010',
  '00000000-0000-4000-a000-000000000002',
  250000,
  'groceries',
  'Super Indo',
  'Weekly groceries - demo',
  'pending'
) on conflict (id) do nothing;

commit;
