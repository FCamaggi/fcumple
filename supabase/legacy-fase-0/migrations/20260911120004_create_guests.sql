create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  token text unique not null default public.generate_guest_token(),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  plus_ones_allowed int not null default 0,
  plus_ones_confirmed int not null default 0 check (plus_ones_confirmed <= plus_ones_allowed),
  guest_note text,
  admin_note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guests_token_idx on public.guests (token);

drop trigger if exists guests_set_updated_at on public.guests;
create trigger guests_set_updated_at
  before update on public.guests
  for each row
  execute function public.set_updated_at();

-- Row Level Security is the whole point of this table: a guest never logs
-- in, so nothing here can be gated by auth.uid(). Instead we lock the table
-- down completely (no policy => no access for anon/authenticated at the row
-- level) and expose guests to their own data only through the SECURITY
-- DEFINER RPC functions in a later migration, which validate the token
-- themselves before touching any row.
alter table public.guests enable row level security;

-- The single admin authenticates via Supabase Auth (see supabase/README.md).
-- With only one admin user, a single "authenticated can do anything" policy
-- is enough; no need for a finer-grained role system.
drop policy if exists "authenticated_full_access" on public.guests;
create policy "authenticated_full_access" on public.guests
  for all
  to authenticated
  using (true)
  with check (true);

-- Table-level privileges are enforced in addition to RLS: even a role with
-- an allowing policy still needs an explicit GRANT, and a role with no GRANT
-- at all (anon, here) is rejected before RLS is even evaluated. This is the
-- "not accessible directly" requirement in depth, not just via RLS.
revoke all on public.guests from anon;
grant select, insert, update, delete on public.guests to authenticated;
