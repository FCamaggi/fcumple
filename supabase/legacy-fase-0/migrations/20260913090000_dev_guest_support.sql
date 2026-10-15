-- Etapa de pruebas: un invitado DEV real (fila real en guests, token fijo)
-- para poder navegar /i/dev-preview y ejercitar todo el flujo de invitado
-- (RSVP, cupo de fotos, check-in, pantallas de error) sin límites normales
-- y sin contaminar los números reales del evento (headcount público,
-- tallies del admin).

-- Marca que distingue al invitado DEV de los invitados reales. Todo lo
-- demás sobre esta fila (status, plus_ones, fotos) puede cambiar libremente
-- durante las pruebas -- is_dev es la única señal estable que el resto del
-- sistema necesita para excluirlo de conteos públicos.
alter table public.guests add column if not exists is_dev boolean not null default false;

-- Mismo cuerpo que get_public_headcount original (20260912100009), sumando
-- `and g.is_dev = false` para que el invitado DEV nunca cuente en el número
-- público de /evento, sin importar en qué estado quede a mitad de una
-- sesión de pruebas.
create or replace function public.get_public_headcount()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(1 + g.plus_ones_confirmed), 0)::int
  from public.guests g
  where g.status = 'confirmed'
    and g.is_dev = false;
$$;

grant execute on function public.get_public_headcount() to anon, authenticated;

-- Seed idempotente del invitado DEV fijo. El `on conflict` solo toca
-- is_dev para no pisar valores que el usuario haya editado a mano después
-- del seed inicial (por ejemplo, si cambió full_name o photo_quota desde el
-- admin, esta migración no los revierte en un re-run).
insert into public.guests (token, full_name, plus_ones_allowed, photo_quota, is_dev)
values ('dev-preview', 'DEV Preview', 10, 999, true)
on conflict (token) do update set is_dev = true;

-- Resetea el invitado DEV a un estado limpio para poder reprobar el flujo
-- completo (RSVP, cupo de fotos, check-in) repetidamente sin recrear la
-- fila a mano. Solo actúa si el token dado matchea un invitado con
-- is_dev = true; si no matchea ningún invitado, o matchea uno que no es
-- DEV, no hace nada -- mismo criterio de "no distinguir token inválido" que
-- ya usa get_guest_by_token (no hay excepción, no hay rama de "not found").
--
-- Es seguro exponerlo a anon (igual que submit_rsvp/check_in_guest) porque
-- el `where is_dev = true` interno es la única puerta: aunque alguien
-- adivine el nombre de la función y el token de un invitado real, esa fila
-- nunca tiene is_dev = true (no hay ningún otro camino que lo setee), así
-- que el UPDATE y el DELETE de fotos afectan 0 filas. El único invitado que
-- esta función puede tocar es el propio invitado DEV, semilla fija de esta
-- misma migración.
create or replace function public.dev_reset_guest(p_token text)
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
  v_guest_id uuid;
begin
  select g.id into v_guest_id
  from public.guests g
  where g.token = p_token
    and g.is_dev = true;

  if found then
    delete from public.photos p where p.guest_id = v_guest_id;

    update public.guests g
    set status = 'pending',
        plus_ones_confirmed = 0,
        guest_note = null,
        responded_at = null,
        checked_in_at = null
    where g.id = v_guest_id;
  end if;

  return query
  select g.id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed,
         g.guest_note, g.responded_at, g.checked_in_at
  from public.guests g
  where g.token = p_token;
end;
$$;

grant execute on function public.dev_reset_guest(text) to anon, authenticated;
