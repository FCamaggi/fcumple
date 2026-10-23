-- Cartelera, activacion de la camara por QR, subtitulo y tema por evento.
--
--   * Camara: nuevo modo events.camera_unlock = 'on_event_qr' (el nuevo por defecto): la camara se
--     habilita cuando el invitado escanea el QR impreso de la fiesta. El QR lleva un codigo por evento
--     (events.activation_code, secreto: NO sale en get_event_public ni en ninguna RPC de invitado) y
--     activate_camera(token, codigo) lo comprueba y marca guests.camera_activated_at. submit_photo lo exige.
--   * Fotos por lotes: las fotos aprobadas NO se ven hasta que el organizador las publica
--     (photos.published_at). publish_photo_batch publica todas las aprobadas que aun no se publicaron y se
--     puede repetir durante la fiesta. Antes: un unico "revelado" de todo (events.photos_revealed_at).
--   * events.subtitle: el titulo es name y el subtitulo va debajo.
--   * events.theme: estilo del evento ({"preset": "<id>"}); los colores de cada preset viven en el cliente
--     (src/lib/theme.ts), la base solo valida la forma.

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create or replace function public.valid_event_theme(t jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  k text;
begin
  if t is null or jsonb_typeof(t) <> 'object' then
    return false;
  end if;
  for k in select jsonb_object_keys(t) loop
    if k <> 'preset' then
      return false;
    end if;
  end loop;
  if t ? 'preset' and (jsonb_typeof(t -> 'preset') <> 'string' or (t ->> 'preset') !~ '^[a-z][a-z0-9-]{0,29}$') then
    return false;
  end if;
  return true;
end;
$$;

alter table public.events
  add column subtitle text,
  add column theme jsonb not null default '{}'::jsonb,
  -- 32 caracteres hexadecimales aleatorios (gen_random_uuid usa el generador criptografico).
  add column activation_code text not null default replace(gen_random_uuid()::text, '-', ''),
  add constraint events_subtitle_len check (subtitle is null or char_length(btrim(subtitle)) between 1 and 80),
  add constraint events_theme_valid check (public.valid_event_theme(theme)),
  add constraint events_activation_code_len check (char_length(activation_code) >= 16);

alter table public.events drop constraint events_camera_unlock_check;
alter table public.events
  add constraint events_camera_unlock_check check (camera_unlock in ('on_identify', 'on_checkin', 'on_event_qr')),
  alter column camera_unlock set default 'on_event_qr';

-- ---------------------------------------------------------------------------
-- guests y photos
-- ---------------------------------------------------------------------------
alter table public.guests add column camera_activated_at timestamptz;

alter table public.photos add column published_at timestamptz;
create index photos_event_published_idx on public.photos (event_id, published_at);

-- Lo que ya estaba revelado sigue visible: las fotos aprobadas de un evento revelado quedan publicadas.
update public.photos p
   set published_at = e.photos_revealed_at
  from public.events e
 where e.id = p.event_id
   and e.photos_revealed_at is not null
   and p.status = 'approved'
   and p.published_at is null;

-- ---------------------------------------------------------------------------
-- Lectura publica del evento: ahora con subtitulo y tema (cambia el tipo de retorno).
-- ---------------------------------------------------------------------------
drop function public.get_event_public(text);

create function public.get_event_public(p_slug text)
returns table (
  id uuid,
  name text,
  starts_at timestamptz,
  location text,
  rsvp_deadline timestamptz,
  access_mode text,
  camera_unlock text,
  rsvp_enabled boolean,
  photos_revealed boolean,
  enrollment_config jsonb,
  subtitle text,
  theme jsonb
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select e.id, e.name, e.starts_at, e.location, e.rsvp_deadline, e.access_mode,
         e.camera_unlock, e.rsvp_enabled, (e.photos_revealed_at is not null), e.enrollment_config,
         e.subtitle, e.theme
  from public.events e
  where e.slug = p_slug;
$$;

grant execute on function public.get_event_public(text) to anon, authenticated;

-- El invitado ve si ya activo su camara.
drop function public.get_guest_by_token(text);

create function public.get_guest_by_token(p_token text)
returns table (
  id uuid,
  event_id uuid,
  full_name text,
  status text,
  plus_ones_allowed int,
  plus_ones_confirmed int,
  guest_note text,
  responded_at timestamptz,
  checked_in_at timestamptz,
  photo_quota int,
  camera_activated_at timestamptz
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select g.id, g.event_id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed,
         g.guest_note, g.responded_at, g.checked_in_at, g.photo_quota, g.camera_activated_at
  from public._approved_guest(p_token) g;
$$;

grant execute on function public.get_guest_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activacion de la camara con el QR de la fiesta.
-- Devuelve false si el codigo no corresponde (cuenta como intento fallido: frena la fuerza bruta).
-- ---------------------------------------------------------------------------
create or replace function public.activate_camera(p_token text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest public.guests%rowtype;
  v_code text;
  v_key text := public.request_client_key();
begin
  select * into v_guest from public._approved_guest(p_token);
  if not found then
    raise exception 'no guest matches this token' using errcode = 'P0002';
  end if;

  perform public._guard_attempts(v_guest.event_id, v_key);

  select e.activation_code into v_code from public.events e where e.id = v_guest.event_id;
  if p_code is null or p_code <> v_code then
    perform public._record_failure(v_guest.event_id, v_key);
    return false;
  end if;

  update public.guests g
     set camera_activated_at = coalesce(g.camera_activated_at, now())
   where g.id = v_guest.id;
  return true;
end;
$$;

grant execute on function public.activate_camera(text, text) to anon, authenticated;

-- Cambia el codigo del QR (si se filtro): el QR impreso deja de servir; quien ya activo sigue activado.
create or replace function public.rotate_activation_code(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'only the event owner can rotate the activation code' using errcode = '42501';
  end if;
  update public.events e
     set activation_code = replace(gen_random_uuid()::text, '-', '')
   where e.id = p_event_id
  returning e.activation_code into v_code;
  return v_code;
end;
$$;

revoke execute on function public.rotate_activation_code(uuid) from public, anon;
grant execute on function public.rotate_activation_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_photo: ahora tambien exige la activacion cuando el evento usa el QR.
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

  -- Cuenta toda fila sin importar su estado, para que no se pueda spamear,
  -- que lo rechacen y reintentar sin limite.
  select count(*) into v_used from public.photos p where p.guest_id = v_guest.id;
  if v_used >= v_guest.photo_quota then
    raise exception 'photo quota (%) already reached', v_guest.photo_quota using errcode = '22023';
  end if;

  v_status := case when v_guest.auto_approve_photos then 'approved' else 'pending' end;

  return query
  insert into public.photos (event_id, guest_id, storage_path, display_storage_path, status)
  values (v_guest.event_id, v_guest.id, p_storage_path, p_display_storage_path, v_status)
  returning photos.id, photos.guest_id, photos.storage_path, photos.display_storage_path,
            photos.status, photos.created_at;
end;
$$;

grant execute on function public.submit_photo(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fotos por lotes: se ven las aprobadas Y publicadas.
-- ---------------------------------------------------------------------------
create or replace function public.list_revealed_photos(p_token text)
returns table (
  storage_path text,
  display_storage_path text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select p.storage_path, p.display_storage_path, p.created_at
  from public._approved_guest(p_token) g
  join public.photos p on p.event_id = g.event_id
  where p.status = 'approved'
    and p.published_at is not null
  order by p.created_at;
$$;

grant execute on function public.list_revealed_photos(text) to anon, authenticated;

create or replace function public.party_photo_is_revealed(p_path text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1
    from public.photos p
    where (p.storage_path = p_path or p.display_storage_path = p_path)
      and p.status = 'approved'
      and p.published_at is not null
  );
$$;

-- Publica el lote: todas las fotos aprobadas que aun no se habian publicado. Devuelve cuantas fueron.
-- La primera vez tambien marca el evento como "con fotos reveladas" (lo que lee el hub).
create or replace function public.publish_photo_batch(p_event_id uuid)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'only the event owner can publish photos' using errcode = '42501';
  end if;

  update public.photos p
     set published_at = now()
   where p.event_id = p_event_id
     and p.status = 'approved'
     and p.published_at is null;
  get diagnostics v_count = row_count;

  update public.events e
     set photos_revealed_at = coalesce(e.photos_revealed_at, now())
   where e.id = p_event_id;

  return v_count;
end;
$$;

revoke execute on function public.publish_photo_batch(uuid) from public, anon;
grant execute on function public.publish_photo_batch(uuid) to authenticated;
