-- 0003_functions.sql — atomic money functions + ledger append-only guard
begin;

-- Guard: prevent UPDATE/DELETE on ledger_entries via trigger (defense in depth)
create or replace function public.prevent_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries is append-only: % not allowed', TG_OP;
  return null;
end; $$;

drop trigger if exists trg_ledger_no_update on public.ledger_entries;
create trigger trg_ledger_no_update before update or delete on public.ledger_entries for each row execute function public.prevent_ledger_mutation();

-- APPROVE: owner only, pending -> approved, reserves budget
create or replace function public.approve_request(p_request_id uuid)
returns public.reimbursement_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req public.reimbursement_requests%rowtype;
  v_budget public.budgets%rowtype;
begin
  if not public.is_owner() then
    raise exception 'Only owner can approve requests';
  end if;

  select * into v_req from public.reimbursement_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status != 'pending' then raise exception 'Only pending requests can be approved (current: %)', v_req.status; end if;

  select * into v_budget from public.budgets where id = v_req.budget_id for update;
  if not found then raise exception 'Budget not found'; end if;
  if v_budget.status != 'active' then raise exception 'Budget is not active'; end if;
  if (v_budget.total_amount - v_budget.allocated_amount) < v_req.amount then
    raise exception 'Insufficient budget: available %, requested %', (v_budget.total_amount - v_budget.allocated_amount), v_req.amount;
  end if;

  -- reserve
  update public.budgets set allocated_amount = allocated_amount + v_req.amount where id = v_budget.id;

  update public.reimbursement_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = p_request_id
    returning * into v_req;

  -- also create credit? No, allocation is reservation; ledger created only on reconcile
  return v_req;
end; $$;

-- REJECT
create or replace function public.reject_request(p_request_id uuid, p_reason text)
returns public.reimbursement_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.reimbursement_requests%rowtype;
begin
  if not public.is_owner() then raise exception 'Only owner can reject requests'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then raise exception 'Rejection reason required (>=3 chars)'; end if;

  select * into v_req from public.reimbursement_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status != 'pending' then raise exception 'Only pending requests can be rejected'; end if;

  update public.reimbursement_requests
    set status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), rejection_reason=p_reason, updated_at=now()
    where id=p_request_id returning * into v_req;
  return v_req;
end; $$;

-- RECONCILE: approved -> reconciled, creates ledger debit atomically
create or replace function public.reconcile_request(p_request_id uuid, p_note text)
returns public.reconciliations
language plpgsql security definer set search_path = public as $$
declare
  v_req public.reimbursement_requests%rowtype;
  v_ledger_id uuid;
  v_recon public.reconciliations%rowtype;
begin
  if not public.is_owner() then raise exception 'Only owner can reconcile'; end if;

  select * into v_req from public.reimbursement_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status != 'approved' then raise exception 'Only approved requests can be reconciled (current: %)', v_req.status; end if;
  -- idempotency guard: already reconciled?
  if exists (select 1 from public.reconciliations where request_id = p_request_id) then
    raise exception 'Request already reconciled';
  end if;

  -- create ledger entry (debit = spend)
  insert into public.ledger_entries (budget_id, debit, credit, reference_id, reference_type, description)
    values (v_req.budget_id, v_req.amount, 0, v_req.id, 'reimbursement', coalesce(v_req.merchant,'') || ' - ' || coalesce(v_req.description,''))
    returning id into v_ledger_id;

  insert into public.reconciliations (request_id, reconciled_by, note, ledger_entry_id)
    values (p_request_id, auth.uid(), p_note, v_ledger_id)
    returning * into v_recon;

  update public.reimbursement_requests set status='reconciled', updated_at=now() where id=p_request_id;

  return v_recon;
end; $$;

-- Optional: budget top-up function (creates ledger credit)
create or replace function public.topup_budget(p_budget_id uuid, p_amount numeric, p_description text)
returns public.ledger_entries
language plpgsql security definer set search_path = public as $$
declare v_entry public.ledger_entries%rowtype;
begin
  if not public.is_owner() then raise exception 'Only owner can top up'; end if;
  if p_amount <= 0 then raise exception 'Top-up amount must be >0'; end if;

  update public.budgets set total_amount = total_amount + p_amount where id = p_budget_id;
  if not found then raise exception 'Budget not found'; end if;

  insert into public.ledger_entries (budget_id, debit, credit, reference_id, reference_type, description)
    values (p_budget_id, 0, p_amount, p_budget_id, 'budget_allocation', coalesce(p_description,'Top-up'))
    returning * into v_entry;
  return v_entry;
end; $$;

-- Export reconciliation statement helper (returns ledger for budget)
create or replace function public.get_reconciliation_statement(p_budget_id uuid)
returns setof public.ledger_entries
language sql security definer set search_path = public stable as $$
  select * from public.ledger_entries where budget_id = p_budget_id order by created_at asc;
$$;

revoke all on function public.approve_request(uuid) from public;
revoke all on function public.reject_request(uuid,text) from public;
revoke all on function public.reconcile_request(uuid,text) from public;
revoke all on function public.topup_budget(uuid,numeric,text) from public;
grant execute on function public.approve_request(uuid) to authenticated;
grant execute on function public.reject_request(uuid,text) to authenticated;
grant execute on function public.reconcile_request(uuid,text) to authenticated;
grant execute on function public.topup_budget(uuid,numeric,text) to authenticated;
grant execute on function public.get_reconciliation_statement(uuid) to authenticated;

commit;
