-- RPC publicas de la Fase 1. Todas derivan el evento del token del invitado
-- (o del slug en las lecturas publicas del hub): ninguna asume "el unico
-- evento" como en la Fase 0.

-- Interno: invitado aprobado por token (cero filas si no existe o si aun no
-- fue aprobado / fue rechazado).
create or replace function public._approved_guest(p_token text)
returns setof public.guests
language sql
security definer
set search_path = public, extensions
stable
as $$
  select * from public.guests g
  where g.token = p_token and g.approval_status = 'approved';
$$;

revoke execute on function public._approved_guest(text) from public, anon, authenticated;

create or replace function public.get_event_public(p_slug text)
returns table (
  id uuid,
  name text,
  starts_at timestamptz,
  location text,
  rsvp_deadline timestamptz,
  access_mode text,
  camera_unlock text,
  rsvp_enabled boolean,
  photos_revealed boolean
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select e.id, e.name, e.starts_at, e.location, e.rsvp_deadline, e.access_mode,
         e.camera_unlock, e.rsvp_enabled, (e.photos_revealed_at is not null)
  from public.events e
  where e.slug = p_slug;
$$;

grant execute on function public.get_event_public(text) to anon, authenticated;

create or replace function public.get_guest_by_token(p_token text)
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
  photo_quota int
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select g.id, g.event_id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed,
         g.guest_note, g.responded_at, g.checked_in_at, g.photo_quota
  from public._approved_guest(p_token) g;
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
  event_id uuid,
  full_name text,
  status text,
  plus_ones_allowed int,
  plus_ones_confirmed int,
  guest_note text,
  responded_at timestamptz,
  checked_in_at timestamptz,
  photo_quota int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest public.guests%rowtype;
  v_rsvp_enabled boolean;
begin
  if p_status not in ('confirmed', 'declined') then
    raise exception 'invalid status: must be confirmed or declined, got %', p_status
      using errcode = '22023';
  end if;

  select * into v_guest from public._approved_guest(p_token);
  if not found then
    raise exception 'no guest matches this token' using errcode = 'P0002';
  end if;

  select e.rsvp_enabled into v_rsvp_enabled from public.events e where e.id = v_guest.event_id;
  if not v_rsvp_enabled then
    raise exception 'rsvp is disabled for this event' using errcode = '42501';
  end if;

  if p_plus_ones < 0 or p_plus_ones > v_guest.plus_ones_allowed then
    raise exception 'plus_ones (%) must be between 0 and % for this guest', p_plus_ones, v_guest.plus_ones_allowed
      using errcode = '22023';
  end if;

  return query
  update public.guests g
     set status = p_status,
         plus_ones_confirmed = p_plus_ones,
         guest_note = p_note,
         responded_at = now()
   where g.id = v_guest.id
  returning g.id, g.event_id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed,
            g.guest_note, g.responded_at, g.checked_in_at, g.photo_quota;
end;
$$;

grant execute on function public.submit_rsvp(text, text, int, text) to anon, authenticated;

create or replace function public.get_photo_quota(p_token text)
returns table (quota int, used int)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select g.photo_quota,
         (select count(*)::int from public.photos p where p.guest_id = g.id)
  from public._approved_guest(p_token) g;
$$;

grant execute on function public.get_photo_quota(text) to anon, authenticated;

-- Registra la metadata de una foto ya subida a Storage. Las rutas deben ser
-- {event_id}/{guest_id}/{archivo}: ids no secretos (list_revealed_photos las
-- entrega a todo el evento, por eso NUNCA llevan el token).
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

-- Check-in: SOLO el organizador dueno del evento (en la Fase 0 cualquiera con
-- un token podia marcarse a si mismo, saltandose la puerta).
create or replace function public.check_in_guest(p_token text)
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
  photo_quota int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest public.guests%rowtype;
begin
  select * into v_guest from public.guests g where g.token = p_token;
  if not found then
    raise exception 'no guest matches this token' using errcode = 'P0002';
  end if;

  if not public.is_event_owner(v_guest.event_id) then
    raise exception 'only the event owner can check guests in' using errcode = '42501';
  end if;

  -- Idempotente: re-escanear no pisa la primera hora de llegada.
  return query
  update public.guests g
     set checked_in_at = coalesce(g.checked_in_at, now())
   where g.id = v_guest.id
  returning g.id, g.event_id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed,
            g.guest_note, g.responded_at, g.checked_in_at, g.photo_quota;
end;
$$;

revoke execute on function public.check_in_guest(text) from public, anon;
grant execute on function public.check_in_guest(text) to authenticated;

-- El rollo revelado de SU evento, solo para invitados identificados (en la
-- Fase 0 era publico y sin token).
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
  join public.events e on e.id = g.event_id
  join public.photos p on p.event_id = e.id
  where e.photos_revealed_at is not null
    and p.status = 'approved'
  order by p.created_at;
$$;

grant execute on function public.list_revealed_photos(text) to anon, authenticated;

create or replace function public.get_public_headcount(p_slug text)
returns int
language sql
security definer
set search_path = public, extensions
stable
as $$
  select coalesce(sum(1 + g.plus_ones_confirmed), 0)::int
  from public.events e
  join public.guests g on g.event_id = e.id
  where e.slug = p_slug
    and g.status = 'confirmed'
    and g.approval_status = 'approved';
$$;

grant execute on function public.get_public_headcount(text) to anon, authenticated;

create or replace function public.list_published_posts(p_slug text)
returns table (
  id uuid,
  title text,
  subtitle text,
  body text,
  cover_image_path text,
  published_at timestamptz,
  images jsonb
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select p.id, p.title, p.subtitle, p.body, p.cover_image_path, p.published_at,
         coalesce(
           (select jsonb_agg(pi.storage_path order by pi.position, pi.created_at)
              from public.post_images pi where pi.post_id = p.id),
           '[]'::jsonb
         )
  from public.events e
  join public.posts p on p.event_id = e.id
  where e.slug = p_slug
    and p.published_at is not null
    and p.published_at <= now()
  order by p.published_at desc;
$$;

grant execute on function public.list_published_posts(text) to anon, authenticated;

-- Alta de evento: genera el slug (nombre + sufijo aleatorio, no adivinable).
create or replace function public.create_event(
  p_name text,
  p_starts_at timestamptz default null,
  p_location text default null
)
returns setof public.events
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base text;
  v_attempt int := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_base := left(public.slugify(p_name), 40);
  if v_base is null or v_base = '' then
    v_base := 'evento';
  end if;
  v_base := btrim(v_base, '-');

  loop
    v_attempt := v_attempt + 1;
    begin
      return query
      insert into public.events (owner_id, slug, name, starts_at, location)
      values (auth.uid(), v_base || '-' || public.random_suffix(4), btrim(p_name), p_starts_at, p_location)
      returning *;
      return;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.create_event(text, timestamptz, text) from public, anon;
grant execute on function public.create_event(text, timestamptz, text) to authenticated;
