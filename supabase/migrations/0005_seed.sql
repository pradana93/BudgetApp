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

-- Only seed placeholder profiles when matching auth.users exist (local dev).
-- On linked remote DBs without those auth users, skip gracefully instead of
-- violating profiles_id_fkey. Real users are created via Supabase Auth and
-- the handle_new_user() trigger creates profiles on signup.
insert into public.profiles (id, email, display_name, role)
select v.id, v.email, v.display_name, v.role
from (values
  ('00000000-0000-4000-a000-000000000001'::uuid, 'owner@budgetapp.local', 'Owner', 'owner'),
  ('00000000-0000-4000-a000-000000000002'::uuid, 'member@budgetapp.local', 'Member', 'member')
) as v(id, email, display_name, role)
where exists (select 1 from auth.users u where u.id = v.id)
on conflict (id) do update set email = excluded.email, role = excluded.role;

-- Seed a demo budget owned by owner (only if owner profile exists)
insert into public.budgets (id, owner_id, name, total_amount, currency, period_start, period_end, status)
select
  '00000000-0000-4000-a000-000000000010'::uuid,
  '00000000-0000-4000-a000-000000000001'::uuid,
  'Household — Demo 2026',
  10000000,
  'IDR',
  date_trunc('month', now())::date,
  (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  'active'
where exists (select 1 from public.profiles p where p.id = '00000000-0000-4000-a000-000000000001')
on conflict (id) do nothing;

-- Seed a pending demo request (only if demo budget + member profile exist)
insert into public.reimbursement_requests (id, budget_id, requester_id, amount, category, merchant, description, status)
select
  '00000000-0000-4000-a000-000000000020'::uuid,
  '00000000-0000-4000-a000-000000000010'::uuid,
  '00000000-0000-4000-a000-000000000002'::uuid,
  250000,
  'groceries',
  'Super Indo',
  'Weekly groceries - demo',
  'pending'
where exists (select 1 from public.budgets b where b.id = '00000000-0000-4000-a000-000000000010')
  and exists (select 1 from public.profiles p where p.id = '00000000-0000-4000-a000-000000000002')
on conflict (id) do nothing;

commit;
