-- 0014_comments.sql — owner/member discussion thread per request (idempotent)
begin;

create table if not exists public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.reimbursement_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_request_idx on public.request_comments(request_id, created_at);

alter table public.request_comments enable row level security;

drop policy if exists "comments_select_owner_or_party" on public.request_comments;
drop policy if exists "comments_insert_owner_or_party" on public.request_comments;
drop policy if exists "comments_delete_owner_or_author" on public.request_comments;

-- Owner sees all; members see threads on their own requests.
create policy "comments_select_owner_or_party" on public.request_comments
  for select to authenticated using (
    public.is_owner() or exists (
      select 1 from public.reimbursement_requests r
      where r.id = request_id and r.requester_id = auth.uid()
    )
  );

create policy "comments_insert_owner_or_party" on public.request_comments
  for insert to authenticated with check (
    author_id = auth.uid() and (
      public.is_owner() or exists (
        select 1 from public.reimbursement_requests r
        where r.id = request_id and r.requester_id = auth.uid()
      )
    )
  );

create policy "comments_delete_owner_or_author" on public.request_comments
  for delete to authenticated using (
    public.is_owner() or author_id = auth.uid()
  );

-- Realtime thread updates
do $$
begin
  begin
    alter publication supabase_realtime add table public.request_comments;
  exception when duplicate_object then null;
  end;
end $$;

commit;
