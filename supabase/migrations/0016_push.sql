-- 0016_push.sql — Web Push subscriptions + fan out new-request push (idempotent)
begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_select_own" on public.push_subscriptions;
drop policy if exists "push_insert_own" on public.push_subscriptions;
drop policy if exists "push_delete_own" on public.push_subscriptions;

-- Devices only ever manage their owner's own subscriptions.
create policy "push_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

create policy "push_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

create policy "push_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Extend the new-request webhook to also fan out to the push function.
-- Both calls are fire-and-forget; failures never block the insert.
create or replace function public.notify_owner_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object('record', row_to_json(NEW));
  perform net.http_post(
    url := 'https://frxzokdrpvdqcmbkjwcw.supabase.co/functions/v1/notify-owner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyeHpva2RycHZkcWNtYmtqd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTI4MTUsImV4cCI6MjEwNDc2ODgxNX0.H7wFMejnwyxDemigL-3dBqBfnYr5xKAyl4sRHWjoWdY',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyeHpva2RycHZkcWNtYmtqd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTI4MTUsImV4cCI6MjEwNDc2ODgxNX0.H7wFMejnwyxDemigL-3dBqBfnYr5xKAyl4sRHWjoWdY'
    ),
    body := v_payload,
    timeout_milliseconds := 30000
  );
  perform net.http_post(
    url := 'https://frxzokdrpvdqcmbkjwcw.supabase.co/functions/v1/push-fanout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyeHpva2RycHZkcWNtYmtqd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTI4MTUsImV4cCI6MjEwNDc2ODgxNX0.H7wFMejnwyxDemigL-3dBqBfnYr5xKAyl4sRHWjoWdY',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyeHpva2RycHZkcWNtYmtqd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTI4MTUsImV4cCI6MjEwNDc2ODgxNX0.H7wFMejnwyxDemigL-3dBqBfnYr5xKAyl4sRHWjoWdY'
    ),
    body := v_payload,
    timeout_milliseconds := 30000
  );
  return NEW;
exception when others then
  return NEW;
end; $$;

commit;
