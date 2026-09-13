-- 0012_email_trigger.sql — fire the notify-owner edge function on new requests (idempotent)
begin;

-- Already enabled on the project; kept here so migration history is complete.
create extension if not exists "pg_net";

-- Async webhook: never blocks the insert (exceptions are swallowed on purpose).
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
    body := v_payload
  );
  return NEW;
exception when others then
  return NEW;
end; $$;

drop trigger if exists trg_email_new_request on public.reimbursement_requests;
create trigger trg_email_new_request after insert on public.reimbursement_requests
for each row execute function public.notify_owner_email();

commit;
