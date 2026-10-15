-- Public contract: the total confirmed headcount, and nothing else about any
-- guest. Used by the public /evento page (no token, no login) to show
-- something like "38 en la lista" without ever exposing a name, id, token or
-- any other column from public.guests. SECURITY DEFINER lets it read
-- public.guests despite guests having no anon-facing RLS policy; search_path
-- is pinned so a manipulated search_path can't hijack an unqualified
-- identifier inside the function body.
--
-- Same calculation as `realHeadcount` in src/pages/AdminPage.tsx: every guest
-- with status = 'confirmed' counts as 1 (themself) plus their
-- plus_ones_confirmed. Pending and declined guests contribute 0.
create or replace function public.get_public_headcount()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(1 + g.plus_ones_confirmed), 0)::int
  from public.guests g
  where g.status = 'confirmed';
$$;

grant execute on function public.get_public_headcount() to anon, authenticated;
