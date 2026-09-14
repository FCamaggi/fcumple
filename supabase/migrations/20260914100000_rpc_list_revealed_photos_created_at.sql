-- Frente 3 (docs/BACKLOG.md, Etapa 9): la cartelera va a agrupar el rollo
-- revelado en bandas de una hora, y para eso necesita `created_at` de cada
-- foto. El límite de privacidad ya decidido para este frente se mantiene
-- intacto: sigue sin exponerse `guest_id` (ni ningún otro dato de quién
-- sacó la foto) -- solo se suma el timestamp.

-- Postgres no permite cambiar el tipo de retorno de una función existente
-- con `create or replace` (agregar una columna a `returns table (...)`
-- cuenta como cambio de tipo) -- hay que borrarla primero, mismo patrón que
-- 20260913110000_expose_checked_in_at_to_guest.sql.
drop function if exists public.list_revealed_photos();

create or replace function public.list_revealed_photos()
returns table (
  storage_path text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.storage_path, p.created_at
  from public.photos p, public.event_config e
  where p.status = 'approved'
    and e.photos_revealed_at is not null;
$$;

grant execute on function public.list_revealed_photos() to anon, authenticated;
