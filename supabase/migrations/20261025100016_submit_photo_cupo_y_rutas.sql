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
-- 2. Rutas. El prefijo `{event_id}/{guest_id}/` se comprobaba, pero lo que
--    venia despues no: `../`, `./`, segmentos vacios o barras invertidas
--    quedaban guardados en photos.storage_path. Storage no resuelve `..`, pero
--    una ruta asi no es legitima y no debe llegar a la base. Se rechazan con
--    22000 (y no 22023, que el cliente muestra como «ya usaste todos los
--    disparos»).
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

  select e.camera_unlock into v_camera_unlock from public.events e where e.id = v_guest.event_id;
  if v_camera_unlock = 'on_checkin' and v_guest.checked_in_at is null then
    raise exception 'check-in required before taking photos' using errcode = '42501';
  end if;
  if v_camera_unlock = 'on_event_qr' and v_guest.camera_activated_at is null then
    raise exception 'camera activation (event QR) required before taking photos' using errcode = '42501';
  end if;

  v_prefix := v_guest.event_id::text || '/' || v_guest.id::text || '/';
  if left(p_storage_path, length(v_prefix)) <> v_prefix then
    raise exception 'storage_path must start with {event_id}/{guest_id}/' using errcode = '22023';
  end if;
  if p_display_storage_path is not null
     and left(p_display_storage_path, length(v_prefix)) <> v_prefix then
    raise exception 'display_storage_path must start with {event_id}/{guest_id}/' using errcode = '22023';
  end if;

  -- Ni `.` ni `..` como segmento, ni segmentos vacios (`//`), ni barras invertidas.
  if p_storage_path ~ '(^|/)\.\.?(/|$)' or p_storage_path ~ '//' or position(E'\\' in p_storage_path) > 0 then
    raise exception 'storage_path has an invalid segment' using errcode = '22000';
  end if;
  if p_display_storage_path is not null
     and (p_display_storage_path ~ '(^|/)\.\.?(/|$)' or p_display_storage_path ~ '//'
          or position(E'\\' in p_display_storage_path) > 0) then
    raise exception 'display_storage_path has an invalid segment' using errcode = '22000';
  end if;

  -- Serializa las fotos de ESTE invitado: la segunda llamada espera a que la primera termine y asi su
  -- conteo ya ve la fila nueva. Va antes de mirar si la ruta existe para que el reintento tambien
  -- espere a un registro en curso en vez de chocar con el unique.
  perform 1 from public.guests g where g.id = v_guest.id for update;

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
