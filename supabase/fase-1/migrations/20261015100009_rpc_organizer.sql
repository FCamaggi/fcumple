-- Regenera el token de un invitado (cierra su sesion en cualquier dispositivo).
-- Solo el dueno del evento. Tambien limpia claimed_at / last_seen_at: la
-- persona vuelve a identificarse desde cero.
create or replace function public.regenerate_guest_token(p_guest_id uuid)
returns setof public.guests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  select g.event_id into v_event_id from public.guests g where g.id = p_guest_id;
  if not found then
    raise exception 'guest not found' using errcode = 'P0002';
  end if;

  if not public.is_event_owner(v_event_id) then
    raise exception 'only the event owner can regenerate a guest token' using errcode = '42501';
  end if;

  return query
  update public.guests g
     set token = public.generate_guest_token(), claimed_at = null, last_seen_at = null
   where g.id = p_guest_id
  returning g.*;
end;
$$;

revoke execute on function public.regenerate_guest_token(uuid) from public, anon;
grant execute on function public.regenerate_guest_token(uuid) to authenticated;
