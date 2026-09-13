-- 0011_proposals.sql — member-proposed categories with owner review (idempotent)
begin;

create table if not exists public.category_proposals (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 30),
  merchant text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists catprop_requester_idx on public.category_proposals(requester_id);
create index if not exists catprop_status_idx on public.category_proposals(status);

alter table public.category_proposals enable row level security;

drop policy if exists "catprop_select_owner_or_own" on public.category_proposals;
drop policy if exists "catprop_insert_own" on public.category_proposals;
drop policy if exists "catprop_update_owner_only" on public.category_proposals;
drop policy if exists "catprop_delete_owner_only" on public.category_proposals;

create policy "catprop_select_owner_or_own" on public.category_proposals
  for select to authenticated using (public.is_owner() or requester_id = auth.uid());

create policy "catprop_insert_own" on public.category_proposals
  for insert to authenticated with check (requester_id = auth.uid());

create policy "catprop_update_owner_only" on public.category_proposals
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "catprop_delete_owner_only" on public.category_proposals
  for delete to authenticated using (public.is_owner());

-- Owner-sent decision notifications (client inserts by owners only;
-- the request-lifecycle trigger keeps inserting via security definer)
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('new_request','request_approved','request_rejected','request_reconciled','category_decision'));

drop policy if exists "notifications_insert_owner_only" on public.notifications;
create policy "notifications_insert_owner_only" on public.notifications
  for insert to authenticated with check (public.is_owner());

commit;
