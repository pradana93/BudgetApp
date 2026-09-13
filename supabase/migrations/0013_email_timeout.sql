-- 0013_email_timeout.sql — give the notify-owner function room for cold starts (idempotent)
begin;

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
  return NEW;
exception when others then
  return NEW;
end; $$;

commit;
