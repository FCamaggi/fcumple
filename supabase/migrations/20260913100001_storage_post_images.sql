-- post-images: bucket for the richer posts feature (subtitle + cover +
-- gallery). Unlike party-photos (guest uploads, admin moderates, quota
-- logic), here only the admin ever writes: the admin uploads/deletes from
-- PostsPanel, and anyone with the link can read an object once the post
-- it belongs to (as a cover or as a gallery image) is actually published.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', false)
on conflict (id) do nothing;

-- Same bridge-function reasoning as storage_path_is_revealed in
-- 20260912100003_storage_party_photos.sql: a storage.objects policy runs
-- with the querying role's own privileges (anon here), not as the table
-- owner, and `posts`/`post_images` grant anon SELECT only (no direct
-- table access beyond that) -- so this SECURITY DEFINER function is the
-- bridge that lets the policy ask "is this path public?" without handing
-- anon any broader table access. It answers yes for either use of a path:
-- a gallery row in post_images, or a post's own cover_image_path -- in
-- both cases only once the parent post is published.
create or replace function public.post_image_path_is_public(p_path text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.post_images pi
      join public.posts p on p.id = pi.post_id
      where pi.storage_path = p_path
        and p.published_at is not null
        and p.published_at <= now()
    )
    or exists (
      select 1
      from public.posts p
      where p.cover_image_path = p_path
        and p.published_at is not null
        and p.published_at <= now()
    );
$$;

grant execute on function public.post_image_path_is_public(text) to anon, authenticated;

-- anon has no INSERT policy at all on this bucket: only the admin
-- (authenticated, from PostsPanel) uploads.
drop policy if exists "public_read_published" on storage.objects;
create policy "public_read_published" on storage.objects
  for select
  to anon
  using (
    bucket_id = 'post-images'
    and public.post_image_path_is_public(name)
  );

-- anon deliberately has no insert/update/delete policy on this bucket at
-- all -- read-only, and only for paths that resolve to a published post.

-- The admin (authenticated) needs full access to upload, replace and
-- clean up cover/gallery images regardless of the post's publish state.
drop policy if exists "authenticated_full_access_post_images" on storage.objects;
create policy "authenticated_full_access_post_images" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'post-images')
  with check (bucket_id = 'post-images');
