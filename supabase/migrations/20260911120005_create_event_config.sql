-- event_config holds exactly one row. Using a boolean primary key pinned to
-- `true` (enforced by the check constraint) makes a second row impossible:
-- any other value fails the check, and `true` again collides with the
-- primary key. This avoids a separate "only one row" trigger.
create table if not exists public.event_config (
  id boolean primary key default true,
  event_name text,
  event_date timestamptz,
  location text,
  theme text,
  rsvp_deadline timestamptz,
  constraint event_config_is_singleton check (id)
);

alter table public.event_config enable row level security;

-- Event info is not sensitive and is the same for every guest, so it can be
-- read without a token at all.
drop policy if exists "public_read" on public.event_config;
create policy "public_read" on public.event_config
  for select
  to anon, authenticated
  using (true);

drop policy if exists "authenticated_write" on public.event_config;
create policy "authenticated_write" on public.event_config
  for all
  to authenticated
  using (true)
  with check (true);

grant select on public.event_config to anon;
grant select, insert, update, delete on public.event_config to authenticated;
