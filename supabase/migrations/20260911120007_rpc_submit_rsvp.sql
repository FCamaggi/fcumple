-- Public contract: the ONLY way a guest can write their own RSVP.
-- Defense in depth against RF11 (docs/DESIGN.md 7.2): the frontend already
-- keeps the FaderToggle from submitting while undecided, but this function
-- is the last line of defense -- it refuses to ever persist status =
-- 'pending' (or anything other than 'confirmed'/'declined') through this
-- public entry point, regardless of what a client sends.
-- drop-if-exists antes de create-or-replace: mismo motivo que en
-- get_guest_by_token (ver 20260911120006_rpc_get_guest_by_token.sql) --
-- necesario para que el arnés de test pueda reaplicar todas las
-- migraciones desde cero sin chocar contra el cambio de tipo de retorno de
-- 20260913110000_expose_checked_in_at_to_guest.sql.
drop function if exists public.submit_rsvp(text, text, int, text);

create or replace function public.submit_rsvp(
  p_token text,
  p_status text,
  p_plus_ones int,
  p_note text default null
)
returns table (
  id uuid,
  full_name text,
  status text,
  plus_ones_allowed int,
  plus_ones_confirmed int,
  guest_note text,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed int;
begin
  if p_status not in ('confirmed', 'declined') then
    raise exception 'invalid status: must be confirmed or declined, got %', p_status
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  select g.plus_ones_allowed into v_allowed
  from public.guests g
  where g.token = p_token;

  if not found then
    raise exception 'no guest matches this token'
      using errcode = 'P0002'; -- no_data_found
  end if;

  if p_plus_ones < 0 or p_plus_ones > v_allowed then
    raise exception 'plus_ones (%) must be between 0 and % for this guest', p_plus_ones, v_allowed
      using errcode = '22023';
  end if;

  return query
  update public.guests g
  set status = p_status,
      plus_ones_confirmed = p_plus_ones,
      guest_note = p_note,
      responded_at = now()
  where g.token = p_token
  returning g.id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed, g.guest_note, g.responded_at;
end;
$$;

grant execute on function public.submit_rsvp(text, text, int, text) to anon, authenticated;
