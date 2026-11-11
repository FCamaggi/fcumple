-- Originales servidos desde el PC del evento (T2 de odd/tasks/fotos-originales-pc.md).
--
-- El celular sigue subiendo a Storage (entrada y respaldo). Un worker en el PC, con la clave de servicio,
-- descarga cada original, lo verifica, marca la foto con original_archived_at y borra el original de
-- Storage. El PC entrega las descargas por un Cloudflare Tunnel: solo comprueba la firma del enlace; quien
-- puede ver que foto lo decide photo_original_url, con la misma regla que la lectura de Storage
-- (party_photo_is_revealed para anon, storage_event_owner para los duenos).
--
-- Mientras private.photo_archive este vacia, nada cambia: photo_original_url devuelve null y la app usa
-- Storage como hasta ahora. La fila la carga el dueno de la plataforma desde el editor SQL.

alter table public.photos add column original_archived_at timestamptz;

-- Lo que el worker del PC recorre en cada vuelta.
create index photos_original_pending_idx on public.photos (created_at) where original_archived_at is null;

-- ---------------------------------------------------------------------------
-- Configuracion del PC: fuera de public (PostgREST no la expone) y sin permisos para anon ni authenticated.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.photo_archive (
  id boolean primary key default true check (id),
  -- Direccion publica del tunel, sin barra final: https://fotos.<dominio>
  base_url text not null
    constraint photo_archive_base_url check (base_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?$'),
  -- Secreto HMAC compartido con el PC (variable FOTOS_SIGNING_SECRET).
  signing_secret text not null
    constraint photo_archive_signing_secret check (char_length(signing_secret) >= 32),
  created_at timestamptz not null default now()
);

revoke all on private.photo_archive from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- photo_original_url: enlace firmado al original en el PC.
--   * Lanza not_allowed (42501) si la ruta no es el original de una foto que quien pregunta puede ver;
--     una ruta inexistente responde igual, para no revelar si existe.
--   * Devuelve null si el PC no esta configurado o la foto aun no se archiva: el original sigue en Storage.
--   * El enlace vence en 1 hora. Firma: HMAC-SHA256 en hex de "<ruta>\n<exp>".
-- ---------------------------------------------------------------------------
create or replace function public.photo_original_url(p_storage_path text)
returns text
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_photo public.photos%rowtype;
  v_config private.photo_archive%rowtype;
  v_exp bigint;
  v_sig text;
begin
  select * into v_photo from public.photos where storage_path = p_storage_path;

  -- La ruta manda, como en Storage (que decide el dueno por el evento de la ruta): un dueno puede insertar filas
  -- en photos con cualquier storage_path, asi que se exige el formato de submit_photo
  -- ({event_id}/{guest_id}/{archivo}, sin barras, puntos iniciales ni saltos de linea) y que la ruta sea del
  -- evento de la fila. Esto ademas deja sin ambiguedad el texto firmado "<ruta>\n<exp>".
  if not found
     or p_storage_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,149}$'
     or split_part(p_storage_path, '/', 1) <> v_photo.event_id::text
     or split_part(p_storage_path, '/', 2) <> v_photo.guest_id::text
     or not (
       (v_photo.status = 'approved' and v_photo.published_at is not null)
       or public.is_event_owner(v_photo.event_id)
     ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_config from private.photo_archive where id;
  if not found or v_photo.original_archived_at is null then
    return null;
  end if;

  v_exp := floor(extract(epoch from now()))::bigint + 3600;
  v_sig := encode(
    extensions.hmac(
      convert_to(v_photo.storage_path || E'\n' || v_exp::text, 'UTF8'),
      convert_to(v_config.signing_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  return v_config.base_url || '/p/' || v_photo.storage_path || '?exp=' || v_exp::text || '&sig=' || v_sig;
end;
$$;

revoke all on function public.photo_original_url(text) from public;
grant execute on function public.photo_original_url(text) to anon, authenticated;
