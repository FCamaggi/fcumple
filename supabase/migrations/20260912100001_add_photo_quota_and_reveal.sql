-- Per-guest photo quota (same shape as plus_ones_allowed: admin-adjustable,
-- defaults to a sane value for every existing and future guest).
alter table public.guests
  add column if not exists photo_quota int not null default 5;

-- null = the roll is still hidden from everyone, including the guest who
-- took the photo. The admin sets this to now() to "reveal the roll" once,
-- from then on approved photos become visible. There is no public RPC to
-- clear it back to null on purpose (see docs/BACKLOG.md Etapa 2) -- the
-- admin can do that by hand via SQL if they ever need to.
alter table public.event_config
  add column if not exists photos_revealed_at timestamptz;
