-- 0008_due_date.sql — optional due date for reimbursement requests (idempotent)
begin;

alter table public.reimbursement_requests add column if not exists due_date date;

commit;
