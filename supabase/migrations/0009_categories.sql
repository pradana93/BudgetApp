-- 0009_categories.sql — dynamic request categories managed by owners (idempotent)
begin;

create table if not exists public.categories (
  name text primary key check (char_length(name) between 2 and 30),
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "categories_select_authenticated" on public.categories;
drop policy if exists "categories_insert_owner_only" on public.categories;
drop policy if exists "categories_delete_owner_only" on public.categories;

create policy "categories_select_authenticated" on public.categories
  for select to authenticated using (true);

create policy "categories_insert_owner_only" on public.categories
  for insert to authenticated with check (public.is_owner());

create policy "categories_delete_owner_only" on public.categories
  for delete to authenticated using (public.is_owner());

-- Seed the legacy hardcoded set first (FK below requires existing rows to match)
insert into public.categories (name) values
  ('groceries'), ('transport'), ('dining'), ('utilities'), ('health'), ('other')
on conflict (name) do nothing;

-- Replace the hardcoded CHECK with a real FK (restrict keeps in-use categories safe)
alter table public.reimbursement_requests
  drop constraint if exists reimbursement_requests_category_check;

do $$
begin
  alter table public.reimbursement_requests
    add constraint reimbursement_requests_category_fkey
    foreign key (category) references public.categories(name)
    on update cascade on delete restrict;
exception when duplicate_object then null;
end $$;

-- Realtime so dropdowns update live
do $$
begin
  begin
    alter publication supabase_realtime add table public.categories;
  exception when duplicate_object then null;
  end;
end $$;

commit;
