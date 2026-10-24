-- ---------------------------------------------------------------------------
-- submit_photo idempotente por storage_path.
--
-- Problema: si el servidor registra la foto y la respuesta se pierde (la red de
-- una fiesta), el cliente reintenta. Antes, el reintento usaba otra ruta y
-- gastaba un segundo disparo; con la misma ruta chocaba con el unique de
-- photos.storage_path (23505) y el invitado veia «no pudimos registrarla».
--
-- Ahora, repetir una ruta que ya es de ese invitado devuelve la fila existente:
-- no cuenta contra el cupo (ni siquiera con el rollo agotado) y no modifica la
-- fila (ni su estado ni su copia liviana). Las comprobaciones de
-- activacion, de prefijo de ruta y de cupo para fotos nuevas no cambian.
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

    -- Dos reintentos a la vez: el segundo no inserta y cae a la fila del primero.
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
