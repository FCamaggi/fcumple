-- Bug real encontrado en producción (docs/BACKLOG.md, Etapa 5, punto
-- "persistencia del check-in"): get_guest_by_token/submit_rsvp nunca
-- devolvían checked_in_at -- el frontend lo hardcodeaba a null (ver
-- src/lib/guestApi.ts). Eso significaba que un invitado real NUNCA podía
-- ver su cámara desbloqueada después de que lo escanearan en la puerta,
-- ni cerrando el QR (DoorQrOverlay), ni recargando la página, ni nunca --
-- la única fuente de verdad de checked_in_at (check_in_guest, llamado solo
-- desde el escáner del admin) jamás llegaba de vuelta al invitado.
--
-- Este fix agrega checked_in_at a ambas RPCs -- es información que el
-- propio invitado ya puede inferir por la UI (si ve la cámara o no), así
-- que exponerla no es una filtración nueva, solo corrige una omisión.

-- Postgres no permite cambiar el tipo de retorno de una función existente
-- con `create or replace` (agregar una columna a `returns table (...)`
-- cuenta como cambio de tipo) -- hay que borrarla primero.
drop function if exists public.get_guest_by_token(text);
drop function if exists public.submit_rsvp(text, text, int, text);

create or replace function public.get_guest_by_token(p_token text)
returns table (
  id uuid,
  full_name text,
  status text,
  plus_ones_allowed int,
  plus_ones_confirmed int,
  guest_note text,
  responded_at timestamptz,
  checked_in_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select g.id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed, g.guest_note, g.responded_at, g.checked_in_at
  from public.guests g
  where g.token = p_token;
$$;

grant execute on function public.get_guest_by_token(text) to anon, authenticated;

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
  responded_at timestamptz,
  checked_in_at timestamptz
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
  returning g.id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed, g.guest_note, g.responded_at, g.checked_in_at;
end;
$$;

grant execute on function public.submit_rsvp(text, text, int, text) to anon, authenticated;
