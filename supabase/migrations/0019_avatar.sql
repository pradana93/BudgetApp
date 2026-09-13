-- 0019_avatar.sql — profile photos: avatar_url column + public avatars bucket (idempotent)
begin;

alter table public.profiles add column if not exists avatar_url text;

-- Public-read bucket: avatars are shown to both partners (and cached by <img>).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_all" on storage.objects;
create policy "avatars_select_all" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own_or_owner" on storage.objects;
create policy "avatars_update_own_or_owner" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (public.is_owner() or (storage.foldername(name))[1] = auth.uid()::text)
  ) with check (
    bucket_id = 'avatars' and (public.is_owner() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists "avatars_delete_own_or_owner" on storage.objects;
create policy "avatars_delete_own_or_owner" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (public.is_owner() or (storage.foldername(name))[1] = auth.uid()::text)
  );

commit;
