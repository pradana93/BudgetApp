-- 0024_personal_tags.sql — Tags system for personal transactions (idempotent)
begin;

create table if not exists public.personal_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  color text not null default 'blue' check (char_length(color) between 2 and 20),
  created_at timestamptz not null default now()
);
create unique index if not exists ptag_user_name on public.personal_tags(user_id, lower(name));
create index if not exists ptag_user_idx on public.personal_tags(user_id);

create table if not exists public.personal_note_tags (
  note_id uuid not null references public.personal_notes(id) on delete cascade,
  tag_id uuid not null references public.personal_tags(id) on delete cascade,
  primary key (note_id, tag_id)
);
create index if not exists pntag_note_idx on public.personal_note_tags(note_id);
create index if not exists pntag_tag_idx on public.personal_note_tags(tag_id);

alter table public.personal_tags enable row level security;
alter table public.personal_note_tags enable row level security;

drop policy if exists "ptag_rw_own" on public.personal_tags;
create policy "ptag_rw_own" on public.personal_tags
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "pntag_rw_own" on public.personal_note_tags;
create policy "pntag_rw_own" on public.personal_note_tags
  for all to authenticated
  using (exists (
    select 1 from public.personal_notes n
    where n.id = note_id and n.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.personal_notes n
    where n.id = note_id and n.user_id = auth.uid()
  ));

commit;
