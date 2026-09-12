-- 0007_member_delete.sql — members can delete their own pending requests (idempotent)
begin;

drop policy if exists "requests_delete_owner_only" on public.reimbursement_requests;

create policy "requests_delete_owner_or_own_pending" on public.reimbursement_requests
  for delete to authenticated using (
    public.is_owner() or (requester_id = auth.uid() and status = 'pending')
  );

commit;
