-- 0025_recurring_transactions.sql — Recurring transactions (idempotent)
begin;

create table if not exists public.personal_recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  amount numeric(14,2) not null check (amount > 0),
  category_id uuid references public.personal_categories(id) on delete set null,
  direction text not null default 'expense' check (direction in ('income','expense')),
  account_id uuid references public.personal_accounts(id) on delete set null,
  frequency text not null check (frequency in ('weekly','biweekly','monthly','yearly')),
  next_date date not null default current_date,
  last_generated date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prerec_user_idx on public.personal_recurring(user_id, active, next_date);
create index if not exists prerec_next_date_idx on public.personal_recurring(next_date) where active = true;

drop trigger if exists trg_prerec_updated_at on public.personal_recurring;
create trigger trg_prerec_updated_at before update on public.personal_recurring
for each row execute function public.handle_updated_at();

alter table public.personal_recurring enable row level security;

drop policy if exists "prerec_rw_own" on public.personal_recurring;
create policy "prerec_rw_own" on public.personal_recurring
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
