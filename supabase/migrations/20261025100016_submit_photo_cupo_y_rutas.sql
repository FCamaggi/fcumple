-- ---------------------------------------------------------------------------
-- submit_photo: cupo a prueba de fotos simultaneas y rutas sin segmentos peligrosos.
--
-- 1. Cupo. El conteo `count(*) from photos` y el insert no eran atomicos: dos
--    fotos NUEVAS del mismo invitado en paralelo (dos pestañas, dos telefonos
--    con el mismo enlace) leian el mismo conteo y pasaban las dos. Ahora se
--    toma la fila del invitado (`for update`) antes de contar: la segunda
--    llamada espera a que termine la primera y ve su fila. El bloqueo es por
--    invitado, asi que no frena a nadie mas, y un reintento de una ruta ya
--    registrada sigue devolviendo su fila sin gastar cupo.
--
--    Tras esperar el bloqueo se relee la fila del invitado: si el organizador
--    le bajo el cupo, le quito la aprobacion automatica o lo rechazo mientras
--    tanto, se decide con los valores nuevos.
--
-- 2. Rutas. El prefijo `{event_id}/{guest_id}/` se comprobaba, pero lo que
--    venia despues no: `../`, `./`, segmentos vacios, barras invertidas o una
--    ruta enorme quedaban guardados en photos.storage_path. Storage no
--    resuelve `..`, pero una ruta asi no es legitima y no debe llegar a la
--    base. Ahora lo que sigue al prefijo es un solo nombre de archivo (lista
--    blanca) y se rechaza con 22000 (y no 22023, que el cliente muestra como
--    «ya usaste todos los disparos»).
-- ---------------------------------------------------------------------------
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
set search_path = public, extensions
as $$
declare
  v_guest public.guests%rowtype;
  v_camera_unlock text;
  v_prefix text;
  v_used int;
  v_status text;
  v_photo public.photos%rowtype;
begin
  select * into v_guest from public._approved_guest(p_token);
  if not found then
    raise exception 'no guest matches this token' using errcode = 'P0002';
  end if;

  v_prefix := v_guest.event_id::text || '/' || v_guest.id::text || '/';
  if left(p_storage_path, length(v_prefix)) <> v_prefix then
    raise exception 'storage_path must start with {event_id}/{guest_id}/' using errcode = '22023';
  end if;
  if p_display_storage_path is not null
     and left(p_display_storage_path, length(v_prefix)) <> v_prefix then
    raise exception 'display_storage_path must start with {event_id}/{guest_id}/' using errcode = '22023';
  end if;

  -- Lista blanca para lo que viene tras el prefijo: un solo nombre de archivo (el cliente genera
  -- `{uuid}.jpg` y `{uuid}-display.jpg`) que empieza con letra o digito. Con eso no caben `.` ni `..`,
  -- barras, `//`, un final vacio, barras invertidas, `%`, espacios ni saltos de linea, y el largo
  -- queda acotado (sin esto, una ruta enorme rompia el indice unico con un error crudo).
  if coalesce(substr(p_storage_path, length(v_prefix) + 1) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$', true) then
    raise exception 'storage_path must be a single file name after the prefix' using errcode = '22000';
  end if;
  if p_display_storage_path is not null
     and substr(p_display_storage_path, length(v_prefix) + 1) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$' then
    raise exception 'display_storage_path must be a single file name after the prefix' using errcode = '22000';
  end if;

  -- Serializa las fotos de ESTE invitado: la segunda llamada espera a que la primera termine y asi su
  -- conteo ya ve la fila nueva. Se relee la fila ya con el bloqueo: si mientras esperaba el organizador
  -- le bajo el cupo, le quito la aprobacion automatica o lo rechazo, se decide con los valores nuevos
  -- (Postgres reevalua el `where` tras esperar, asi que un rechazado ya no aparece). `no key update`
  -- basta para serializar entre llamadas y no choca con las claves foraneas de `photos`.
  select * into v_guest
  from public.guests g
  where g.id = v_guest.id and g.approval_status = 'approved'
  for no key update;
  if not found then
    raise exception 'no guest matches this token' using errcode = 'P0002';
  end if;

  select e.camera_unlock into v_camera_unlock from public.events e where e.id = v_guest.event_id;
  if v_camera_unlock = 'on_checkin' and v_guest.checked_in_at is null then
    raise exception 'check-in required before taking photos' using errcode = '42501';
  end if;
  if v_camera_unlock = 'on_event_qr' and v_guest.camera_activated_at is null then
    raise exception 'camera activation (event QR) required before taking photos' using errcode = '42501';
  end if;

  -- Reintento: la ruta ya esta registrada (el prefijo garantiza que es de este invitado).
  select * into v_photo from public.photos p where p.storage_path = p_storage_path;
  if not found then
    -- Cuenta toda fila sin importar su estado, para que no se pueda spamear,
    -- que lo rechacen y reintentar sin limite.
    select count(*) into v_used from public.photos p where p.guest_id = v_guest.id;
    if v_used >= v_guest.photo_quota then
      raise exception 'photo quota (%) already reached', v_guest.photo_quota using errcode = '22023';
    end if;

    v_status := case when v_guest.auto_approve_photos then 'approved' else 'pending' end;

    -- Con el bloqueo de arriba ya no hay carrera entre dos fotos del mismo invitado; el on conflict
    -- queda por si la misma ruta llega desde otra via (p. ej. un insert directo del organizador).
    insert into public.photos (event_id, guest_id, storage_path, display_storage_path, status)
    values (v_guest.event_id, v_guest.id, p_storage_path, p_display_storage_path, v_status)
    -- Por nombre de restriccion: `(storage_path)` choca con la columna de salida del mismo nombre.
    on conflict on constraint photos_storage_path_key do nothing
    returning * into v_photo;

    if not found then
      select * into v_photo from public.photos p where p.storage_path = p_storage_path;
    end if;
  end if;

  -- Un reintento nunca modifica la fila: la copia liviana se fija solo al insertar. Completarla
  -- despues permitiria cambiar lo que muestra el rollo de una foto ya moderada.
  return query
  select v_photo.id, v_photo.guest_id, v_photo.storage_path, v_photo.display_storage_path,
         v_photo.status, v_photo.created_at;
end;
$$;

grant execute on function public.submit_photo(text, text, text) to anon, authenticated;
