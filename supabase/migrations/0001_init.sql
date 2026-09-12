-- 0001_init.sql — core tables (idempotent, transactional)
begin;

-- Enable pgcrypto for gen_random_uuid if not exists
create extension if not exists "pgcrypto";

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_email_idx on public.profiles(email);

-- Budgets
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  allocated_amount numeric(14,2) not null default 0 check (allocated_amount >= 0),
  available_amount numeric(14,2) generated always as (total_amount - allocated_amount) stored,
  currency text not null default 'IDR' check (char_length(currency)=3),
  period_start date,
  period_end date,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint period_check check (period_end is null or period_start is null or period_end >= period_start),
  constraint allocated_lte_total check (allocated_amount <= total_amount)
);
create index if not exists budgets_owner_idx on public.budgets(owner_id);
create index if not exists budgets_status_idx on public.budgets(status);

-- Reimbursement requests
create table if not exists public.reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  category text not null check (category in ('groceries','transport','dining','utilities','health','other')),
  merchant text,
  description text,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','reconciled')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists req_budget_idx on public.reimbursement_requests(budget_id);
create index if not exists req_requester_idx on public.reimbursement_requests(requester_id);
create index if not exists req_status_idx on public.reimbursement_requests(status);
create index if not exists req_created_idx on public.reimbursement_requests(created_at desc);

-- Ledger entries (append-only double-entry lite)
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete restrict,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  reference_id uuid,
  reference_type text not null check (reference_type in ('budget_allocation','reimbursement','adjustment')),
  description text,
  created_at timestamptz not null default now(),
  constraint debit_credit_check check ( (debit > 0 and credit = 0) or (credit > 0 and debit = 0) or (debit=0 and credit=0) )
);
create index if not exists ledger_budget_idx on public.ledger_entries(budget_id);
create index if not exists ledger_ref_idx on public.ledger_entries(reference_id);
create index if not exists ledger_created_idx on public.ledger_entries(created_at desc);

-- Reconciliations
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.reimbursement_requests(id) on delete restrict,
  reconciled_by uuid not null references public.profiles(id),
  reconciled_at timestamptz not null default now(),
  note text,
  ledger_entry_id uuid not null unique references public.ledger_entries(id) on delete restrict
);
create index if not exists recon_request_idx on public.reconciliations(request_id);
create index if not exists recon_ledger_idx on public.reconciliations(ledger_entry_id);

-- updated_at trigger helper
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.handle_updated_at();

drop trigger if exists trg_budgets_updated_at on public.budgets;
create trigger trg_budgets_updated_at before update on public.budgets for each row execute function public.handle_updated_at();

drop trigger if exists trg_requests_updated_at on public.reimbursement_requests;
create trigger trg_requests_updated_at before update on public.reimbursement_requests for each row execute function public.handle_updated_at();

-- auto-create profile on auth.users insert (best-effort, role defaults to member unless email matches owner seed)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    case when new.email = 'owner@budgetapp.local' then 'owner' else 'member' end
  ) on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

commit;
