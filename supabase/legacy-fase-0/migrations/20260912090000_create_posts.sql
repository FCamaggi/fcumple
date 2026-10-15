-- posts holds short admin-authored announcements shown to every guest at
-- /i/:token (event-wide content, not personalized per guest — same access
-- model as event_config). `published_at` doubles as the draft flag: `null`
-- means draft, a timestamp in the past or present means published, and a
-- future timestamp lets the admin schedule a post ahead of time.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- Guests only ever see posts that are actually live: published_at set and
-- not in the future. Drafts and scheduled-but-not-yet-live posts stay
-- invisible to anon/authenticated-as-guest readers.
drop policy if exists "public_read_published" on public.posts;
create policy "public_read_published" on public.posts
  for select
  to anon, authenticated
  using (published_at is not null and published_at <= now());

-- The admin (authenticated) needs full CRUD, including reading and editing
-- drafts — a second, broader policy for that role covers every operation.
drop policy if exists "authenticated_all" on public.posts;
create policy "authenticated_all" on public.posts
  for all
  to authenticated
  using (true)
  with check (true);

grant select on public.posts to anon;
grant select, insert, update, delete on public.posts to authenticated;
