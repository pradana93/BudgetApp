-- 0004_storage.sql — receipts bucket + policies (idempotent)
begin;

-- Create bucket receipts (private, 10MB, image/pdf)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS is enabled by default; create policies on storage.objects

-- Helper to check owner (reuse public.is_owner)

drop policy if exists "receipts_select_owner_or_uploader" on storage.objects;
drop policy if exists "receipts_insert_own_folder" on storage.objects;
drop policy if exists "receipts_update_own" on storage.objects;
drop policy if exists "receipts_delete_owner_or_uploader" on storage.objects;

-- Select: owner can read all receipts; member can read own folder
create policy "receipts_select_owner_or_uploader" on storage.objects
  for select to authenticated using (
    bucket_id = 'receipts' and (
      public.is_owner()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Insert: authenticated can upload only into own user_id folder (first folder = auth.uid())
create policy "receipts_insert_own_folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update: owner or owner of file
create policy "receipts_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'receipts' and (public.is_owner() or (storage.foldername(name))[1] = auth.uid()::text)
  ) with check (
    bucket_id = 'receipts' and (public.is_owner() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- Delete: same as update
create policy "receipts_delete_owner_or_uploader" on storage.objects
  for delete to authenticated using (
    bucket_id = 'receipts' and (public.is_owner() or (storage.foldername(name))[1] = auth.uid()::text)
  );

commit;
