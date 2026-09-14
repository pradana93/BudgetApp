-- 0023_premium_ledger_accounts.sql — Premium MyMoney Ledger: accounts + transfer

begin;

-- Ledger Accounts (per user, like BCA/Cash/Savings)
create table if not exists public.personal_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default 'wallet' check (char_length(icon) between 1 and 30),
  color text not null default 'blue' check (color in ('blue','violet','emerald','amber','rose','slate','cyan','orange')),
  initial_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists personal_accounts_user_idx on public.personal_accounts(user_id);

alter table public.personal_accounts enable row level security;
drop policy if exists "personal_accounts_owner" on public.personal_accounts;
create policy "personal_accounts_owner" on public.personal_accounts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Extend personal_notes to support accounts + transfer
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='personal_notes' and column_name='account_id') then
    alter table public.personal_notes add column account_id uuid references public.personal_accounts(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='personal_notes' and column_name='transfer_to_account_id') then
    alter table public.personal_notes add column transfer_to_account_id uuid references public.personal_accounts(id) on delete set null;
  end if;
  -- allow transfer direction (keep income/expense for compat, add transfer)
  -- direction check was not strict, but add comment
end $$;

create index if not exists personal_notes_account_idx on public.personal_notes(account_id);
create index if not exists personal_notes_transfer_to_idx on public.personal_notes(transfer_to_account_id);
create index if not exists personal_notes_user_date_idx on public.personal_notes(user_id, entry_date);

commit;
