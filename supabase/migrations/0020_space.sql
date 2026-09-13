-- 0020_space.sql — personal budgeting space: private notes + personal categories (idempotent)
--
-- Privacy model (the flagship promise): every policy keys on auth.uid() ONLY.
-- There is deliberately NO owner bypass — not even the owner can read another
-- user's notes or categories. The DB itself enforces the promise.
begin;

create table if not exists public.personal_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default 'blue' check (char_length(color) between 2 and 20),
  created_at timestamptz not null default now()
);
create unique index if not exists pcat_user_name on public.personal_categories(user_id, lower(name));
create index if not exists pcat_user_idx on public.personal_categories(user_id);

create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  amount numeric(14,2) check (amount is null or amount >= 0),
  category_id uuid references public.personal_categories(id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pnote_user_idx on public.personal_notes(user_id, pinned desc, updated_at desc);

drop trigger if exists trg_pnotes_updated_at on public.personal_notes;
create trigger trg_pnotes_updated_at before update on public.personal_notes
for each row execute function public.handle_updated_at();

alter table public.personal_categories enable row level security;
alter table public.personal_notes enable row level security;

drop policy if exists "pcat_rw_own" on public.personal_categories;
create policy "pcat_rw_own" on public.personal_categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "pnote_rw_own" on public.personal_notes;
create policy "pnote_rw_own" on public.personal_notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (category_id is null or exists (
      select 1 from public.personal_categories c
      where c.id = category_id and c.user_id = auth.uid()
    ))
  );

commit;
