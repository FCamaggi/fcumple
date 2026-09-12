-- party-photos: private bucket (public = false) for the photo gallery.
-- Supabase provisions the `storage` schema itself on every real project;
-- this insert assumes it already exists (see supabase/tests/apply-migrations.ts
-- for how the Postgres-in-Docker test harness replicates a minimal version
-- of it, since plain postgres:16-alpine does not ship one).
insert into storage.buckets (id, name, public)
values ('party-photos', 'party-photos', false)
on conflict (id) do nothing;

-- Storage RLS policies run with the privileges of the querying role (anon
-- here), not as the table owner -- unlike a SECURITY DEFINER RPC. `guests`
-- and `photos` deliberately have `revoke all ... from anon` (see their own
-- migrations), so a plain `exists (select 1 from public.guests ...)` inline
-- in the policy would fail with "permission denied for table guests" the
-- moment anon tried to insert/select, before RLS on those tables even gets
-- a chance to run -- confirmed by running this against real Postgres.
-- These two SECURITY DEFINER helpers are the same bridge pattern already
-- used by submit_rsvp / get_guest_by_token: they run with the function
-- owner's privileges, so they can read the locked-down tables, while still
-- only ever answering a single yes/no question -- no table access is
-- handed to anon.
create or replace function public.token_matches_guest(p_token text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.guests g where g.token = p_token);
$$;

create or replace function public.storage_path_is_revealed(p_path text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.photos p, public.event_config e
    where p.storage_path = p_path
      and p.status = 'approved'
      and e.photos_revealed_at is not null
  );
$$;

grant execute on function public.token_matches_guest(text) to anon, authenticated;
grant execute on function public.storage_path_is_revealed(text) to anon, authenticated;

-- anon can create an object only inside a folder named after a real
-- guest token -- i.e. the first path segment of the object name must match
-- some guest's token. This is deliberately NOT a cupo (quota) check: it
-- only confirms "this path belongs to a real invitee", nothing about how
-- many photos they already have.
drop policy if exists "guest_insert_own_folder" on storage.objects;
create policy "guest_insert_own_folder" on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'party-photos'
    and public.token_matches_guest((storage.foldername(name))[1])
  );

-- The cupo (photo_quota) is intentionally NOT enforced here. It is
-- enforced by the submit_photo RPC instead, which counts the guest's
-- existing photos and rejects the insert inside a single atomic
-- transaction. A storage policy cannot do the equivalent "count then
-- allow" check on the raw file upload without a race: two concurrent
-- uploads could each pass a count-based check before either one commits,
-- letting a guest exceed their quota. Past "this path belongs to a real
-- guest", the storage policy has no atomic way to also guard the count,
-- so that responsibility stays entirely in the RPC.
drop policy if exists "public_read_approved_revealed" on storage.objects;
create policy "public_read_approved_revealed" on storage.objects
  for select
  to anon
  using (
    bucket_id = 'party-photos'
    and public.storage_path_is_revealed(name)
  );

-- anon deliberately has no update/delete policy on storage.objects at all:
-- once uploaded, a guest cannot modify or remove their own (or anyone
-- else's) file.

-- The admin (authenticated) needs full access to moderate and clean up.
drop policy if exists "authenticated_full_access" on storage.objects;
create policy "authenticated_full_access" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'party-photos')
  with check (bucket_id = 'party-photos');
