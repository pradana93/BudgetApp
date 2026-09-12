-- 0006_notifications.sql — user notifications for the request lifecycle (idempotent)
begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('new_request','request_approved','request_rejected','request_reconciled')),
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notif_user_idx on public.notifications(user_id);
create index if not exists notif_unread_idx on public.notifications(user_id, is_read);
create index if not exists notif_created_idx on public.notifications(created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
drop policy if exists "notifications_delete_own" on public.notifications;

-- Users can only ever see/touch their own rows. Inserts come from the
-- security-definer trigger below, never directly from clients.
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- Trigger: new request -> notify oldest owner; status change -> notify requester
create or replace function public.notify_on_request_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner_id uuid;
begin
  if TG_OP = 'INSERT' then
    select p.id into v_owner_id from public.profiles p where p.role = 'owner' order by p.created_at limit 1;
    if v_owner_id is not null and NEW.requester_id <> v_owner_id then
      insert into public.notifications (user_id, type, title, body, link)
      values (v_owner_id, 'new_request', 'New reimbursement request',
        coalesce(NEW.merchant, NEW.category) || ' — ' || NEW.amount::text,
        '/requests/' || NEW.id::text);
    end if;
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if NEW.status <> OLD.status and NEW.status in ('approved', 'rejected', 'reconciled') then
      insert into public.notifications (user_id, type, title, body, link)
      values (NEW.requester_id, 'request_' || NEW.status, 'Request ' || NEW.status,
        coalesce(NEW.merchant, NEW.category) || ' — ' || NEW.amount::text,
        '/requests/' || NEW.id::text);
    end if;
    return NEW;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_requests on public.reimbursement_requests;
create trigger trg_notify_requests after insert or update on public.reimbursement_requests
for each row execute function public.notify_on_request_change();

-- Realtime for the bell + notifications page
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;

commit;
