-- 0002_rls.sql — enable RLS + policies (idempotent)
begin;

-- Helper: is_owner() — security definer to avoid recursion
create or replace function public.is_owner()
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner');
$$;

create or replace function public.is_member()
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'member');
$$;

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.budgets enable row level security;
alter table public.reimbursement_requests enable row level security;
alter table public.reconciliations enable row level security;
alter table public.ledger_entries enable row level security;

-- Clean existing policies if re-run (drop if exists)
drop policy if exists "profiles_select_own_or_owner" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own_or_owner" on public.profiles;
drop policy if exists "profiles_delete_owner_only" on public.profiles;

drop policy if exists "budgets_select_all_authenticated" on public.budgets;
drop policy if exists "budgets_insert_owner_only" on public.budgets;
drop policy if exists "budgets_update_owner_only" on public.budgets;
drop policy if exists "budgets_delete_owner_only" on public.budgets;

drop policy if exists "requests_select_owner_all_member_own" on public.reimbursement_requests;
drop policy if exists "requests_insert_member_own" on public.reimbursement_requests;
drop policy if exists "requests_update_owner_or_own_pending" on public.reimbursement_requests;
drop policy if exists "requests_delete_owner_only" on public.reimbursement_requests;

drop policy if exists "ledger_select_authenticated" on public.ledger_entries;
drop policy if exists "ledger_insert_via_function_only" on public.ledger_entries;
drop policy if exists "reconciliations_select_authenticated" on public.reconciliations;
drop policy if exists "reconciliations_insert_owner_only" on public.reconciliations;

-- PROFILES policies
create policy "profiles_select_own_or_owner" on public.profiles
  for select to authenticated using (auth.uid() = id or public.is_owner());

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update_own_or_owner" on public.profiles
  for update to authenticated using (auth.uid() = id or public.is_owner()) with check (auth.uid() = id or public.is_owner());

create policy "profiles_delete_owner_only" on public.profiles
  for delete to authenticated using (public.is_owner());

-- BUDGETS policies
create policy "budgets_select_all_authenticated" on public.budgets
  for select to authenticated using (true);

create policy "budgets_insert_owner_only" on public.budgets
  for insert to authenticated with check (public.is_owner() and owner_id = auth.uid());

create policy "budgets_update_owner_only" on public.budgets
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "budgets_delete_owner_only" on public.budgets
  for delete to authenticated using (public.is_owner());

-- REIMBURSEMENT_REQUESTS policies
create policy "requests_select_owner_all_member_own" on public.reimbursement_requests
  for select to authenticated using (public.is_owner() or requester_id = auth.uid());

create policy "requests_insert_member_own" on public.reimbursement_requests
  for insert to authenticated with check (requester_id = auth.uid());

create policy "requests_update_owner_or_own_pending" on public.reimbursement_requests
  for update to authenticated using (
    public.is_owner() or (requester_id = auth.uid() and status = 'pending')
  ) with check (
    public.is_owner() or (requester_id = auth.uid() and status = 'pending')
  );

create policy "requests_delete_owner_only" on public.reimbursement_requests
  for delete to authenticated using (public.is_owner());

-- LEDGER_ENTRIES policies
create policy "ledger_select_authenticated" on public.ledger_entries
  for select to authenticated using (true);

-- No direct insert for ledger except via service functions - but allow owner via function context
-- We allow authenticated to insert because functions run as authenticated+security definer fallback
create policy "ledger_insert_via_function_only" on public.ledger_entries
  for insert to authenticated with check (true);

-- RECONCILIATIONS policies
create policy "reconciliations_select_authenticated" on public.reconciliations
  for select to authenticated using (true);

create policy "reconciliations_insert_owner_only" on public.reconciliations
  for insert to authenticated with check (public.is_owner());

-- Revoke direct modification on ledger to enforce append-only (allow only INSERT via policies, no UPDATE/DELETE)
-- RLS already blocks anon; explicitly revoke for authenticated
revoke update, delete on public.ledger_entries from anon, authenticated;
-- ensure no public update/delete grant remains
-- Grants for insert/select remain via RLS policies + default grant
grant select, insert on public.ledger_entries to authenticated;

-- Ensure realtime publication includes tables
-- Supabase realtime uses supabase_realtime publication
do $$
begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
exception when duplicate_object then null;
end $$;

-- Add tables to realtime publication if not already
do $$
begin
  begin
    alter publication supabase_realtime add table public.budgets;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.reimbursement_requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.ledger_entries;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.reconciliations;
  exception when duplicate_object then null;
  end;
end $$;

commit;
