-- Feature: separar la imagen liviana de "display" (para navegar el rollo
-- revelado, sin gastar ancho de banda) del archivo original descargable.
-- El pase de frontend (posterior a esta migración) va a generar y subir un
-- segundo archivo más chico al capturar la foto; acá solo se agrega el
-- soporte de columna/RPC/storage-policy para que ese segundo archivo tenga
-- dónde vivir y quién lo pueda leer una vez revelado.
alter table public.photos
  add column if not exists display_storage_path text;

-- Postgres no permite cambiar la firma (agregar un parámetro) ni el tipo de
-- retorno de una función existente con `create or replace` -- hay que
-- borrar ambas firmas posibles primero (la de 2 argumentos de antes de esta
-- migración, y la de 3 de esta misma migración) para que el harness de test
-- pueda reaplicar todas las migraciones desde cero sin chocar.
drop function if exists public.submit_photo(text, text);
drop function if exists public.submit_photo(text, text, text);

create or replace function public.submit_photo(
  p_token text,
  p_storage_path text,
  p_display_storage_path text default null
)
returns table (
  id uuid,
  guest_id uuid,
  storage_path text,
  display_storage_path text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_quota int;
  v_auto_approve boolean;
  v_used int;
  v_prefix text;
  v_status text;
begin
  select g.id, g.photo_quota, g.auto_approve_photos
    into v_guest_id, v_quota, v_auto_approve
  from public.guests g
  where g.token = p_token;

  if not found then
    raise exception 'no guest matches this token'
      using errcode = 'P0002'; -- no_data_found
  end if;

  v_prefix := p_token || '/';
  if left(p_storage_path, length(v_prefix)) <> v_prefix then
    raise exception 'storage_path must start with the guest token'
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  -- Same prefix check as storage_path, but only when a display path was
  -- actually provided -- older callers (and photos with no display version)
  -- keep passing null here.
  if p_display_storage_path is not null
     and left(p_display_storage_path, length(v_prefix)) <> v_prefix then
    raise exception 'display_storage_path must start with the guest token'
      using errcode = '22023';
  end if;

  -- Every row counts against the quota regardless of status (pending,
  -- approved, or rejected) so a guest cannot spam uploads, get them
  -- rejected, and keep retrying indefinitely.
  select count(*) into v_used
  from public.photos p
  where p.guest_id = v_guest_id;

  if v_used >= v_quota then
    raise exception 'photo quota (%) already reached', v_quota
      using errcode = '22023';
  end if;

  v_status := case when v_auto_approve then 'approved' else 'pending' end;

  return query
  insert into public.photos (guest_id, storage_path, display_storage_path, status)
  values (v_guest_id, p_storage_path, p_display_storage_path, v_status)
  returning
    photos.id,
    photos.guest_id,
    photos.storage_path,
    photos.display_storage_path,
    photos.status,
    photos.created_at;
end;
$$;

grant execute on function public.submit_photo(text, text, text) to anon, authenticated;

-- Same drop-then-recreate pattern as
-- 20260914100000_rpc_list_revealed_photos_created_at.sql: adding a column
-- to `returns table (...)` counts as a return-type change.
drop function if exists public.list_revealed_photos();

create or replace function public.list_revealed_photos()
returns table (
  storage_path text,
  display_storage_path text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.storage_path, p.display_storage_path, p.created_at
  from public.photos p, public.event_config e
  where p.status = 'approved'
    and e.photos_revealed_at is not null;
$$;

grant execute on function public.list_revealed_photos() to anon, authenticated;

-- storage_path_is_revealed now also treats display_storage_path as a
-- revealed path under the same conditions (approved + globally revealed):
-- it's a second object in the same bucket for the same photo row, and
-- needs the same anon SELECT access once revealed.
create or replace function public.storage_path_is_revealed(p_path text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.photos p, public.event_config e
    where (p.storage_path = p_path or p.display_storage_path = p_path)
      and p.status = 'approved'
      and e.photos_revealed_at is not null
  );
$$;
