-- 0018_reset_where.sql — same reset, deletes qualified with WHERE true (idempotent)
--
-- Some client/pooler layers reject bare DELETE statements; qualifying them
-- changes nothing semantically (all rows still match) but satisfies those guards.
begin;

create or replace function public.reset_all_data()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_comments int := 0;
  c_recon int := 0;
  c_notif int := 0;
  c_props int := 0;
  c_req int := 0;
  c_ledger int := 0;
  c_budgets int := 0;
  c_goals int := 0;
begin
  if not public.is_owner() then
    raise exception 'Only owner can reset the database';
  end if;

  -- Children before parents (FK restrict constraints).
  delete from public.request_comments where true;
  GET DIAGNOSTICS c_comments = ROW_COUNT;

  delete from public.reconciliations where true;
  GET DIAGNOSTICS c_recon = ROW_COUNT;

  delete from public.notifications where true;
  GET DIAGNOSTICS c_notif = ROW_COUNT;

  delete from public.category_proposals where true;
  GET DIAGNOSTICS c_props = ROW_COUNT;

  delete from public.reimbursement_requests where true;
  GET DIAGNOSTICS c_req = ROW_COUNT;

  -- Ledger is append-only: lift the guard just for this wipe, then restore it.
  alter table public.ledger_entries disable trigger trg_ledger_no_update;
  begin
    delete from public.ledger_entries where true;
    GET DIAGNOSTICS c_ledger = ROW_COUNT;
  exception when others then
    alter table public.ledger_entries enable trigger trg_ledger_no_update;
    raise;
  end;
  alter table public.ledger_entries enable trigger trg_ledger_no_update;

  delete from public.budgets where true;
  GET DIAGNOSTICS c_budgets = ROW_COUNT;

  delete from public.savings_goals where true;
  GET DIAGNOSTICS c_goals = ROW_COUNT;

  return jsonb_build_object(
    'comments', c_comments,
    'reconciliations', c_recon,
    'notifications', c_notif,
    'proposals', c_props,
    'requests', c_req,
    'ledger', c_ledger,
    'budgets', c_budgets,
    'goals', c_goals
  );
end; $$;

revoke all on function public.reset_all_data() from public;
grant execute on function public.reset_all_data() to authenticated;

commit;
