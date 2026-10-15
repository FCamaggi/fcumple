-- Public contract: lets the frontend show the FilmRollCounter (remaining
-- shots) without exposing the whole photos table to a guest with no session.
create or replace function public.get_photo_quota(p_token text)
returns table (
  quota int,
  used int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_quota int;
begin
  select g.id, g.photo_quota into v_guest_id, v_quota
  from public.guests g
  where g.token = p_token;

  if not found then
    return; -- no rows, same convention as get_guest_by_token
  end if;

  return query
  select v_quota, count(*)::int
  from public.photos p
  where p.guest_id = v_guest_id;
end;
$$;

grant execute on function public.get_photo_quota(text) to anon, authenticated;
