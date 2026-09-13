-- 0010_undo.sql — cancel approvals and reconciliations (idempotent)
begin;

-- UN-APPROVE: approved -> pending, releases the budget reservation.
-- Blocked once reconciled (cancel the reconciliation first).
create or replace function public.unapprove_request(p_request_id uuid)
returns public.reimbursement_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.reimbursement_requests%rowtype;
begin
  if not public.is_owner() then
    raise exception 'Only owner can cancel approvals';
  end if;

  select * into v_req from public.reimbursement_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status != 'approved' then
    raise exception 'Only approved requests can be un-approved (current: %)', v_req.status;
  end if;
  if exists (select 1 from public.reconciliations where request_id = p_request_id) then
    raise exception 'Request already reconciled — cancel the reconciliation first';
  end if;

  update public.budgets
    set allocated_amount = allocated_amount - v_req.amount
    where id = v_req.budget_id;

  update public.reimbursement_requests
    set status = 'pending', reviewed_by = null, reviewed_at = null,
        rejection_reason = null, updated_at = now()
    where id = p_request_id
    returning * into v_req;
  return v_req;
end; $$;

-- UN-RECONCILE: reconciled -> approved via a REVERSING ledger entry.
-- The ledger stays append-only: nothing is updated or deleted except the
-- reconciliations link row (which is not money movement).
create or replace function public.unreconcile_request(p_request_id uuid, p_note text default null)
returns public.reimbursement_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req public.reimbursement_requests%rowtype;
begin
  if not public.is_owner() then
    raise exception 'Only owner can cancel reconciliations';
  end if;

  select * into v_req from public.reimbursement_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status != 'reconciled' then
    raise exception 'Only reconciled requests can be un-reconciled (current: %)', v_req.status;
  end if;
  if not exists (select 1 from public.reconciliations where request_id = p_request_id) then
    raise exception 'Reconciliation record missing — cannot reverse';
  end if;

  -- reversing entry: credit offsets the original debit
  insert into public.ledger_entries (budget_id, debit, credit, reference_id, reference_type, description)
    values (v_req.budget_id, 0, v_req.amount, v_req.id, 'adjustment',
      'Reversal of reconciliation' || case when p_note is not null and p_note <> '' then ': ' || p_note else '' end);

  delete from public.reconciliations where request_id = p_request_id;

  update public.reimbursement_requests
    set status = 'approved', updated_at = now()
    where id = p_request_id
    returning * into v_req;
  return v_req;
end; $$;

revoke all on function public.unapprove_request(uuid) from public;
revoke all on function public.unreconcile_request(uuid, text) from public;
grant execute on function public.unapprove_request(uuid) to authenticated;
grant execute on function public.unreconcile_request(uuid, text) to authenticated;

commit;
