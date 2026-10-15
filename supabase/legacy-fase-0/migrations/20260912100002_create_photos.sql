-- photos holds the moderation metadata for the photo gallery. The actual
-- file bytes live in the party-photos Storage bucket (see the next
-- migration); this table is what the admin queues to approve/reject and
-- what the reveal/quota logic checks against.
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists photos_guest_id_idx on public.photos (guest_id);

-- Same model as guests: a guest never has a session, so nothing here can be
-- gated by auth.uid(). No policy at all is granted to anon -- RLS denies
-- everything by default -- and guest access goes exclusively through the
-- submit_photo / get_photo_quota SECURITY DEFINER RPCs in a later migration.
alter table public.photos enable row level security;

-- The single admin (authenticated) needs full CRUD to moderate: list every
-- photo regardless of status, approve/reject by updating status, delete if
-- needed.
drop policy if exists "authenticated_full_access" on public.photos;
create policy "authenticated_full_access" on public.photos
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on public.photos from anon;
grant select, insert, update, delete on public.photos to authenticated;
