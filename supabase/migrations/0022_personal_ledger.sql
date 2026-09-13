-- 0022_personal_ledger.sql — turn personal notes into a personal ledger (idempotent)
begin;

alter table public.personal_notes add column if not exists direction text not null default 'expense' check (direction in ('income','expense'));
alter table public.personal_notes add column if not exists entry_date date not null default current_date;

create index if not exists pnote_user_date_idx on public.personal_notes(user_id, entry_date desc, created_at desc);

commit;
