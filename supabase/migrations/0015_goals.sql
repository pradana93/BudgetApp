-- 0015_goals.sql — shared savings goals with manual contributions (idempotent)
begin;

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount numeric(14,2) not null default 0 check (saved_amount >= 0),
  currency text not null default 'IDR' check (char_length(currency) = 3),
  status text not null default 'active' check (status in ('active','done','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_status_idx on public.savings_goals(status);

alter table public.savings_goals enable row level security;

drop policy if exists "goals_select_authenticated" on public.savings_goals;
drop policy if exists "goals_insert_owner_only" on public.savings_goals;
drop policy if exists "goals_update_owner_only" on public.savings_goals;
drop policy if exists "goals_delete_owner_only" on public.savings_goals;

-- Both partners see the pots; only the owner manages them.
create policy "goals_select_authenticated" on public.savings_goals
  for select to authenticated using (true);

create policy "goals_insert_owner_only" on public.savings_goals
  for insert to authenticated with check (public.is_owner() and owner_id = auth.uid());

create policy "goals_update_owner_only" on public.savings_goals
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "goals_delete_owner_only" on public.savings_goals
  for delete to authenticated using (public.is_owner());

drop trigger if exists trg_goals_updated_at on public.savings_goals;
create trigger trg_goals_updated_at before update on public.savings_goals
for each row execute function public.handle_updated_at();

commit;
