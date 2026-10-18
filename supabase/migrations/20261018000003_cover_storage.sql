-- ============================================================================
-- 0005: cover photo storage
--
-- Leads can upload their own cover photo in /create and in a project's
-- Settings tab. The browser downscales the picture to a JPEG of at most
-- 1600px wide and uploads it to the public bucket "covers" at
--   <auth.uid()>/<uuid>.jpg
-- The listing's existing `cover` column stores the public URL, so no table
-- changes are needed.
--
-- Rules after this migration
--   * Bucket "covers" is public: anyone can read a cover, the same as the
--     listing it belongs to.
--   * Files are at most 5 MB and must be JPEG, PNG or WebP.
--   * A signed-in user can insert, update and delete only objects whose first
--     folder is their own user id. Nobody can write into another user's folder,
--     and anonymous users cannot write at all.
--
-- Idempotent: the bucket insert does nothing when the bucket exists, and each
-- policy is dropped before it is created.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- RLS is already on for storage.objects in every Supabase project, and the
-- table belongs to supabase_storage_admin, so this migration does not alter it.

drop policy if exists "covers_public_read" on storage.objects;
create policy "covers_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'covers');

drop policy if exists "covers_owner_insert" on storage.objects;
create policy "covers_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "covers_owner_update" on storage.objects;
create policy "covers_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "covers_owner_delete" on storage.objects;
create policy "covers_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
