-- =============================================================================
-- setup-fase-1.sql  --  ARCHIVO GENERADO (npm run build:setup-sql); no editar a mano
-- =============================================================================
-- Pegar COMPLETO en el SQL Editor de Supabase y ejecutar UNA vez. Hace, en una
-- sola transaccion (si algo falla no se aplica nada):
--   1. PODA la Fase 0: borra todo lo de la Fase 0 (IRREVERSIBLE).
--   2. Aplica las migraciones de la Fase 1, en orden.
--   3. Las registra en supabase_migrations.schema_migrations, para que el
--      `supabase db push` del deploy no intente aplicarlas otra vez.
--
-- ANTES: haz un respaldo (Database > Backups o pg_dump).
-- DESPUES: vacia a mano los buckets party-photos y post-images (Storage) y
-- configura Auth. Guia completa: docs/fase-1-mvp-multitenant/puesta-en-marcha.md
-- =============================================================================
begin;

-- ===========================================================================
-- 1 / 3  PODA DE LA FASE 0
-- ===========================================================================
-- =============================================================================
-- PRUNE de la Fase 0  --  DESTRUCTIVO e IRREVERSIBLE
-- =============================================================================
-- Deja el proyecto Supabase actual listo para la Fase 1: borra TODO lo que
-- creo la Fase 0 (tablas, funciones, politicas) y el historial de migraciones.
--
-- QUE HACE
--   1. Borra todas las politicas de storage.objects. Es el paso mas importante:
--      `drop schema public cascade` NO se las lleva si no dependen de una
--      funcion de `public`, y la politica "authenticated_full_access" de la
--      Fase 0 (todo party-photos para cualquier usuario autenticado) quedaria
--      viva y le daria a CADA organizador acceso a las fotos de TODOS los
--      eventos.
--   2. Recrea el esquema `public` vacio, con los privilegios por defecto de
--      Supabase.
--   3. Vacia supabase_migrations.schema_migrations, para que `supabase db push`
--      aplique las migraciones de la Fase 1 desde cero.
--
-- QUE NO HACE (lo haces tu)
--   - Hacer un respaldo ANTES (pg_dump o Database > Backups). No hay deshacer.
--   - Vaciar los buckets party-photos y post-images: Supabase no permite
--     borrar storage.objects con SQL; hazlo en el panel (Storage). Los archivos
--     viejos quedan inaccesibles para la app nueva, pero ocupan espacio.
--   - Auth: los usuarios (p. ej. la cuenta de admin de la Fase 0) se conservan
--     y pueden usarse como organizador.
--
-- COMO EJECUTARLO: SQL Editor de Supabase (rol postgres) o psql. Todo corre en
-- una transaccion: si algo falla, no se aplica nada.
-- =============================================================================

do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end
$$;

drop schema public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to postgres, anon, authenticated, service_role;

do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    truncate supabase_migrations.schema_migrations;
  end if;
end
$$;

-- ===========================================================================
-- 2 / 3  MIGRACIONES DE LA FASE 1
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 20261015100001_foundations.sql
-- ---------------------------------------------------------------------------
-- Fase 1 (multi-tenant) -- fundamentos compartidos.
-- Este directorio NO es el que aplica `supabase db push` en el deploy de la
-- Fase 0: ver ../README.md para el plan de corte a un proyecto nuevo.

-- En Supabase pgcrypto vive en el esquema `extensions`: toda funcion que fije
-- `search_path` debe incluirlo (`public, extensions`) para encontrar
-- gen_random_bytes / crypt / gen_salt.
create extension if not exists pgcrypto;

-- Token de sesion del invitado (72 bits, URL-safe). Ya no viaja en un enlace
-- por invitado: lo entregan register_guest / login_guest. NUNCA debe
-- formar parte de una ruta de Storage (la Fase 0 lo hacia y list_revealed_photos
-- lo filtraba a cualquiera; aqui las rutas usan ids no secretos).
create or replace function public.generate_guest_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Normaliza un nombre a un conjunto ordenado de palabras en minusculas, sin
-- tildes ni signos, sin particulas ("de", "la"...) ni iniciales sueltas. Es la
-- base de la identificacion por nombre: "Maria  de los Angeles Perez" y
-- "perez, maria angeles" producen las mismas palabras.
create or replace function public.name_tokens(p_name text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct t order by t), '{}'::text[])
  from regexp_split_to_table(
    lower(translate(
      coalesce(p_name, ''),
      'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñÇç',
      'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNnCc'
    )),
    '[^a-z]+'
  ) as t
  where length(t) >= 2
    and t not in ('de', 'del', 'la', 'las', 'los', 'y');
$$;

create or replace function public.slugify(p_text text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      lower(translate(
        coalesce(p_text, ''),
        'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñÇç',
        'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNnCc'
      )),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  );
$$;

-- Sufijo aleatorio sin caracteres ambiguos (0/o, 1/l/i) para que el enlace
-- del evento no sea adivinable.
create or replace function public.random_suffix(p_len int default 4)
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes bytea := gen_random_bytes(p_len);
  result text := '';
  i int;
begin
  for i in 0 .. p_len - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.safe_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 20261015100002_events.sql
-- ---------------------------------------------------------------------------
-- events: un evento por fila. El "tenant" del MVP es el organizador
-- (auth.users); no hay tabla de organizaciones hasta la Fase 2.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  starts_at timestamptz,
  location text,
  rsvp_deadline timestamptz,
  -- null = el rollo sigue oculto para todos. El organizador lo fija a now()
  -- para "revelar".
  photos_revealed_at timestamptz,
  -- Como entran los invitados (ver docs/fase-1-mvp-multitenant/acceso-de-invitados.md).
  -- En todos los modos la persona se inscribe / inicia sesion con su nombre y
  -- apellido y un PIN que ella misma elige:
  --   open           cualquiera con el enlace se inscribe (por defecto)
  --   list           solo quien el organizador cargo en la lista puede inscribirse
  --   list_requests  lista + solicitudes de quien no esta, que el organizador aprueba
  access_mode text not null default 'open'
    check (access_mode in ('open', 'list', 'list_requests')),
  -- on_identify: la camara se habilita al entrar.
  -- on_checkin:  solo despues de que el organizador marca la llegada.
  camera_unlock text not null default 'on_identify'
    check (camera_unlock in ('on_identify', 'on_checkin')),
  rsvp_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- Bridge SECURITY DEFINER: las politicas de las demas tablas preguntan "soy
-- el dueno de este evento?" sin necesitar acceso directo a events.
create or replace function public.is_event_owner(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.owner_id = auth.uid()
  );
$$;

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;

create policy "owner_all" on public.events
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 20261015100003_guests.sql
-- ---------------------------------------------------------------------------
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  full_name text not null,
  -- Palabras normalizadas de full_name (ver name_tokens). La mantiene el
  -- trigger de abajo; es lo que usan register_guest / login_guest para encontrarlo.
  name_tokens text[] not null default '{}',
  token text not null unique default public.generate_guest_token(),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  plus_ones_allowed int not null default 0 check (plus_ones_allowed >= 0),
  plus_ones_confirmed int not null default 0 check (plus_ones_confirmed <= plus_ones_allowed),
  guest_note text,
  admin_note text,
  responded_at timestamptz,
  photo_quota int not null default 5 check (photo_quota >= 0),
  auto_approve_photos boolean not null default true,
  checked_in_at timestamptz,
  -- pending: pidio acceso (modo list_requests) y espera al organizador.
  approval_status text not null default 'approved'
    check (approval_status in ('approved', 'pending', 'rejected')),
  claimed_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "minimo nombre y apellido": al menos dos palabras distintas.
  constraint guests_name_has_first_and_last check (cardinality(name_tokens) >= 2),
  -- Permite la clave foranea compuesta (id, event_id) desde photos.
  constraint guests_id_event_unique unique (id, event_id)
);

-- Dos invitados con las mismas palabras en un evento serian indistinguibles
-- al identificarse; el organizador debe diferenciarlos (p. ej. con el 2do
-- apellido).
create unique index guests_event_name_key
  on public.guests (event_id, name_tokens);

create or replace function public.guests_normalize_name()
returns trigger
language plpgsql
as $$
begin
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  new.name_tokens := public.name_tokens(new.full_name);
  return new;
end;
$$;

create trigger guests_normalize_name
  before insert or update of full_name on public.guests
  for each row execute function public.guests_normalize_name();

create trigger guests_set_updated_at
  before update on public.guests
  for each row execute function public.set_updated_at();

-- Heredado de la Fase 0 (bug real de QA): un invitado que deja de estar
-- 'confirmed' pierde su check-in, para no ver RSVP y camara a la vez.
create or replace function public.reset_checked_in_at_on_status_change()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'confirmed' and new.status is distinct from 'confirmed' and new.checked_in_at is not null then
    new.checked_in_at := null;
  end if;
  return new;
end;
$$;

create trigger guests_reset_checked_in_at
  before update on public.guests
  for each row execute function public.reset_checked_in_at_on_status_change();

-- Un invitado nunca tiene sesion de Supabase: todo acceso suyo pasa por RPC
-- que validan el token. Solo el organizador dueno del evento ve la tabla.
alter table public.guests enable row level security;
revoke all on public.guests from anon, authenticated;
grant select, insert, update, delete on public.guests to authenticated;

create policy "owner_all" on public.guests
  for all
  to authenticated
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

-- Credenciales del invitado: el PIN que ELIGE al inscribirse (hash bcrypt, nunca
-- el PIN) y el bloqueo por intentos fallidos. Tabla aparte, sin ningun permiso
-- para anon ni authenticated: ni el organizador puede leer los hashes (un PIN de
-- 4 digitos se adivinaria a partir del hash). Solo las funciones SECURITY
-- DEFINER la tocan.
create table public.guest_credentials (
  guest_id uuid primary key references public.guests (id) on delete cascade,
  pin_hash text not null,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.guest_credentials enable row level security;
revoke all on public.guest_credentials from anon, authenticated;

-- Intentos fallidos de inscripcion / inicio de sesion, para frenar que alguien
-- pruebe nombres hasta descubrir quienes estan. Sin acceso para nadie salvo
-- las funciones SECURITY DEFINER.
create table public.identify_attempts (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  client_key text not null,
  attempted_at timestamptz not null default now()
);

create index identify_attempts_event_time_idx
  on public.identify_attempts (event_id, attempted_at);

alter table public.identify_attempts enable row level security;
revoke all on public.identify_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 20261015100004_photos_posts.sql
-- ---------------------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_id uuid not null,
  -- {event_id}/{guest_id}/{archivo}: ids no secretos, nunca el token.
  storage_path text not null unique,
  display_storage_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  -- Una foto no puede colgar de un invitado de otro evento.
  constraint photos_guest_same_event
    foreign key (guest_id, event_id) references public.guests (id, event_id) on delete cascade
);

create index photos_event_idx on public.photos (event_id, created_at);
create index photos_guest_idx on public.photos (guest_id);

alter table public.photos enable row level security;
revoke all on public.photos from anon, authenticated;
grant select, insert, update, delete on public.photos to authenticated;

create policy "owner_all" on public.photos
  for all
  to authenticated
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null,
  subtitle text,
  body text not null,
  cover_image_path text,
  -- null = borrador; futuro = programado.
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint posts_id_event_unique unique (id, event_id)
);

create index posts_event_idx on public.posts (event_id, published_at);

alter table public.posts enable row level security;
revoke all on public.posts from anon, authenticated;
grant select, insert, update, delete on public.posts to authenticated;

create policy "owner_all" on public.posts
  for all
  to authenticated
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

create table public.post_images (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  post_id uuid not null,
  storage_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint post_images_post_same_event
    foreign key (post_id, event_id) references public.posts (id, event_id) on delete cascade
);

create index post_images_post_idx on public.post_images (post_id);

alter table public.post_images enable row level security;
revoke all on public.post_images from anon, authenticated;
grant select, insert, update, delete on public.post_images to authenticated;

create policy "owner_all" on public.post_images
  for all
  to authenticated
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

-- ---------------------------------------------------------------------------
-- 20261015100005_rpc_auth.sql
-- ---------------------------------------------------------------------------
-- Inscripcion e inicio de sesion de invitados con UN enlace por evento.
--
-- La persona se inscribe con su nombre y apellido y un PIN que elige ella
-- misma (4 a 6 digitos; no necesita ser complejo), y despues entra con nombre
-- y PIN. No se pide ni se guarda ningun dato personal mas (ni RUT, ni correo,
-- ni telefono): el PIN se guarda como hash bcrypt en una tabla que nadie puede
-- leer salvo estas funciones.

create or replace function public.request_client_key()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(
      btrim(split_part(
        coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-forwarded-for', ''),
        ',', 1
      )),
      ''
    ),
    'unknown'
  );
$$;

-- Freno de intentos. Solo cuentan los FALLOS (nombre inexistente, PIN
-- equivocado, nombre ocupado, ambiguo): inscribirse o entrar bien no consume
-- nada, porque en una fiesta decenas de invitados comparten la IP del wifi.
create or replace function public._guard_attempts(p_event_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.identify_attempts a where a.attempted_at < now() - interval '1 hour';

  if (select count(*) from public.identify_attempts a
       where a.event_id = p_event_id and a.client_key = p_key
         and a.attempted_at > now() - interval '10 minutes') >= 30
     or (select count(*) from public.identify_attempts a
          where a.event_id = p_event_id
            and a.attempted_at > now() - interval '10 minutes') >= 200
  then
    raise exception 'too many attempts, try again later' using errcode = '53400';
  end if;
end;
$$;

create or replace function public._record_failure(p_event_id uuid, p_key text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.identify_attempts (event_id, client_key) values (p_event_id, p_key);
$$;

revoke execute on function public._guard_attempts(uuid, text) from public, anon, authenticated;
revoke execute on function public._record_failure(uuid, text) from public, anon, authenticated;

-- Guarda (o reemplaza) el PIN y marca la primera entrada. Interno.
create or replace function public._set_credentials(p_guest_id uuid, p_pin text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.guest_credentials (guest_id, pin_hash)
  values (p_guest_id, crypt(p_pin, gen_salt('bf', 8)))
  on conflict (guest_id) do update
    set pin_hash = excluded.pin_hash, failed_count = 0, locked_until = null, updated_at = now();
$$;

revoke execute on function public._set_credentials(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- register_guest: "inscribirme".
--   open           crea al invitado con el nombre y PIN dados.
--   list           solo si el organizador ya lo cargo; la persona elige su PIN.
--   list_requests  igual, y si no esta queda una solicitud pendiente.
-- outcome: ok | pending_approval | name_taken | not_found | ambiguous
-- ---------------------------------------------------------------------------
create or replace function public.register_guest(p_slug text, p_name text, p_pin text)
returns table (
  outcome text,
  guest_token text,
  guest_id uuid,
  guest_name text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_event public.events%rowtype;
  v_tokens text[];
  v_clean text;
  v_key text := public.request_client_key();
  v_ids uuid[];
  v_guest public.guests%rowtype;
begin
  select * into v_event from public.events e where e.slug = p_slug;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'pin must be 4 to 6 digits' using errcode = '22023';
  end if;

  v_tokens := public.name_tokens(p_name);
  if cardinality(v_tokens) < 2 then
    raise exception 'name must include first name and last name' using errcode = '22023';
  end if;
  v_clean := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));

  perform public._guard_attempts(v_event.id, v_key);

  -- ---- Abierto ---------------------------------------------------------
  if v_event.access_mode = 'open' then
    select * into v_guest from public.guests g
     where g.event_id = v_event.id and g.name_tokens = v_tokens;

    if found then
      -- Ya existe: solo se puede reclamar si no tiene PIN (p. ej. el
      -- organizador restablecio su acceso).
      if v_guest.approval_status <> 'approved'
         or exists (select 1 from public.guest_credentials c where c.guest_id = v_guest.id) then
        perform public._record_failure(v_event.id, v_key);
        return query select 'name_taken'::text, null::text, null::uuid, null::text;
        return;
      end if;
    else
      -- Tope por evento: frena la creacion masiva de invitados falsos.
      if (select count(*) from public.guests g where g.event_id = v_event.id) >= 500 then
        raise exception 'event guest limit reached' using errcode = '53400';
      end if;

      begin
        insert into public.guests (event_id, full_name)
        values (v_event.id, v_clean)
        returning * into v_guest;
      exception when unique_violation then
        perform public._record_failure(v_event.id, v_key);
        return query select 'name_taken'::text, null::text, null::uuid, null::text;
        return;
      end;
    end if;

    perform public._set_credentials(v_guest.id, p_pin);
    update public.guests g
       set claimed_at = coalesce(g.claimed_at, now()), last_seen_at = now()
     where g.id = v_guest.id
    returning * into v_guest;

    return query select 'ok'::text, v_guest.token, v_guest.id, v_guest.full_name;
    return;
  end if;

  -- ---- Con lista -------------------------------------------------------
  v_ids := array(
    select g.id from public.guests g
     where g.event_id = v_event.id
       and g.approval_status <> 'rejected'
       and g.name_tokens @> v_tokens
  );

  if cardinality(v_ids) > 1 then
    perform public._record_failure(v_event.id, v_key);
    return query select 'ambiguous'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if cardinality(v_ids) = 1 then
    select * into v_guest from public.guests g where g.id = v_ids[1];

    if exists (select 1 from public.guest_credentials c where c.guest_id = v_guest.id) then
      perform public._record_failure(v_event.id, v_key);
      return query select 'name_taken'::text, null::text, null::uuid, null::text;
      return;
    end if;

    perform public._set_credentials(v_guest.id, p_pin);
    if v_guest.approval_status = 'pending' then
      return query select 'pending_approval'::text, null::text, v_guest.id, v_guest.full_name;
      return;
    end if;

    update public.guests g
       set claimed_at = coalesce(g.claimed_at, now()), last_seen_at = now()
     where g.id = v_guest.id
    returning * into v_guest;

    return query select 'ok'::text, v_guest.token, v_guest.id, v_guest.full_name;
    return;
  end if;

  -- No esta en la lista.
  perform public._record_failure(v_event.id, v_key);

  if v_event.access_mode = 'list_requests' then
    if (select count(*) from public.guests g
         where g.event_id = v_event.id and g.approval_status = 'pending') >= 50 then
      raise exception 'too many pending access requests' using errcode = '53400';
    end if;

    begin
      insert into public.guests (event_id, full_name, approval_status)
      values (v_event.id, v_clean, 'pending')
      returning * into v_guest;
    exception when unique_violation then
      return query select 'name_taken'::text, null::text, null::uuid, null::text;
      return;
    end;

    perform public._set_credentials(v_guest.id, p_pin);
    return query select 'pending_approval'::text, null::text, v_guest.id, v_guest.full_name;
    return;
  end if;

  return query select 'not_found'::text, null::text, null::uuid, null::text;
end;
$$;

grant execute on function public.register_guest(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- login_guest: "ya me inscribi". Nombre + PIN.
-- outcome: ok | pending_approval | invalid | ambiguous | locked | needs_registration
--   invalid            nombre inexistente o PIN equivocado (no se distingue)
--   needs_registration el organizador lo cargo pero nunca eligio su PIN
--   locked             5 PIN equivocados seguidos: 10 minutos de pausa
-- ---------------------------------------------------------------------------
create or replace function public.login_guest(p_slug text, p_name text, p_pin text)
returns table (
  outcome text,
  guest_token text,
  guest_id uuid,
  guest_name text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_event public.events%rowtype;
  v_tokens text[];
  v_key text := public.request_client_key();
  v_ids uuid[];
  v_guest public.guests%rowtype;
  v_cred public.guest_credentials%rowtype;
begin
  select * into v_event from public.events e where e.slug = p_slug;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'pin must be 4 to 6 digits' using errcode = '22023';
  end if;

  v_tokens := public.name_tokens(p_name);
  if cardinality(v_tokens) < 2 then
    raise exception 'name must include first name and last name' using errcode = '22023';
  end if;

  perform public._guard_attempts(v_event.id, v_key);

  v_ids := array(
    select g.id from public.guests g
     where g.event_id = v_event.id
       and g.approval_status <> 'rejected'
       and g.name_tokens @> v_tokens
  );

  if cardinality(v_ids) = 0 then
    perform public._record_failure(v_event.id, v_key);
    return query select 'invalid'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if cardinality(v_ids) > 1 then
    perform public._record_failure(v_event.id, v_key);
    return query select 'ambiguous'::text, null::text, null::uuid, null::text;
    return;
  end if;

  select * into v_guest from public.guests g where g.id = v_ids[1];
  select * into v_cred from public.guest_credentials c where c.guest_id = v_guest.id for update;

  if not found then
    return query select 'needs_registration'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if v_cred.locked_until is not null and v_cred.locked_until > now() then
    return query select 'locked'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if v_cred.pin_hash <> crypt(p_pin, v_cred.pin_hash) then
    update public.guest_credentials c
       set failed_count = case when c.failed_count + 1 >= 5 then 0 else c.failed_count + 1 end,
           locked_until = case when c.failed_count + 1 >= 5 then now() + interval '10 minutes' else null end,
           updated_at = now()
     where c.guest_id = v_guest.id;
    perform public._record_failure(v_event.id, v_key);
    return query select 'invalid'::text, null::text, null::uuid, null::text;
    return;
  end if;

  update public.guest_credentials c
     set failed_count = 0, locked_until = null, updated_at = now()
   where c.guest_id = v_guest.id;

  if v_guest.approval_status = 'pending' then
    return query select 'pending_approval'::text, null::text, v_guest.id, v_guest.full_name;
    return;
  end if;

  update public.guests g
     set claimed_at = coalesce(g.claimed_at, now()), last_seen_at = now()
   where g.id = v_guest.id
  returning * into v_guest;

  return query select 'ok'::text, v_guest.token, v_guest.id, v_guest.full_name;
end;
$$;

grant execute on function public.login_guest(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 20261015100006_rpc_guest.sql
-- ---------------------------------------------------------------------------
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

  -- El registro de organizadores es abierto: tope por cuenta para frenar el
  -- abuso (se puede subir mas adelante con los planes de la Fase 2).
  if (select count(*) from public.events e where e.owner_id = auth.uid()) >= 10 then
    raise exception 'event limit reached' using errcode = '53400';
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

-- ---------------------------------------------------------------------------
-- 20261015100007_storage.sql
-- ---------------------------------------------------------------------------
-- Buckets privados. Rutas:
--   party-photos  {event_id}/{guest_id}/{archivo}
--   post-images   {event_id}/{archivo}
insert into storage.buckets (id, name, public)
values ('party-photos', 'party-photos', false), ('post-images', 'post-images', false)
on conflict (id) do nothing;

-- Las politicas de storage.objects corren con los privilegios del rol que
-- consulta (anon): estas funciones SECURITY DEFINER son el puente para
-- preguntar sin darle acceso directo a las tablas.

create or replace function public.guest_folder_exists(p_event text, p_guest text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1 from public.guests g
    where g.event_id = public.safe_uuid(p_event)
      and g.id = public.safe_uuid(p_guest)
      and g.approval_status = 'approved'
  );
$$;

create or replace function public.storage_event_owner(p_event text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select public.is_event_owner(public.safe_uuid(p_event));
$$;

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
    join public.events e on e.id = p.event_id
    where (p.storage_path = p_path or p.display_storage_path = p_path)
      and p.status = 'approved'
      and e.photos_revealed_at is not null
  );
$$;

create or replace function public.post_image_path_is_public(p_path text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select
    exists (
      select 1 from public.post_images pi
      join public.posts p on p.id = pi.post_id
      where pi.storage_path = p_path
        and p.published_at is not null and p.published_at <= now()
    )
    or exists (
      select 1 from public.posts p
      where p.cover_image_path = p_path
        and p.published_at is not null and p.published_at <= now()
    );
$$;

grant execute on function public.guest_folder_exists(text, text) to anon, authenticated;
grant execute on function public.storage_event_owner(text) to anon, authenticated;
grant execute on function public.party_photo_is_revealed(text) to anon, authenticated;
grant execute on function public.post_image_path_is_public(text) to anon, authenticated;

-- Invitado: solo puede subir dentro de SU carpeta {event_id}/{guest_id}/.
-- El cupo lo aplica submit_photo (atomico), no esta politica.
create policy "guest_insert_own_folder" on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'party-photos'
    and cardinality(storage.foldername(name)) = 2
    and public.guest_folder_exists((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

-- Lectura de fotos aprobadas, solo con el rollo revelado.
create policy "public_read_approved_revealed" on storage.objects
  for select
  to anon
  using (bucket_id = 'party-photos' and public.party_photo_is_revealed(name));

-- Organizador: acceso total a los archivos de SUS eventos.
create policy "owner_party_photos" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'party-photos' and public.storage_event_owner((storage.foldername(name))[1]))
  with check (bucket_id = 'party-photos' and public.storage_event_owner((storage.foldername(name))[1]));

create policy "owner_post_images" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'post-images' and public.storage_event_owner((storage.foldername(name))[1]))
  with check (bucket_id = 'post-images' and public.storage_event_owner((storage.foldername(name))[1]));

create policy "public_read_published_post_images" on storage.objects
  for select
  to anon
  using (bucket_id = 'post-images' and public.post_image_path_is_public(name));

-- ---------------------------------------------------------------------------
-- 20261015100008_rpc_organizer.sql
-- ---------------------------------------------------------------------------
-- Restablece el acceso de un invitado: cambia su token (cierra su sesion en
-- cualquier dispositivo) y borra su PIN, de modo que pueda volver a
-- inscribirse con un PIN nuevo (p. ej. si lo olvido). Solo el dueno del
-- evento. Tambien limpia claimed_at / last_seen_at.
create or replace function public.regenerate_guest_token(p_guest_id uuid)
returns setof public.guests
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event_id uuid;
begin
  select g.event_id into v_event_id from public.guests g where g.id = p_guest_id;
  if not found then
    raise exception 'guest not found' using errcode = 'P0002';
  end if;

  if not public.is_event_owner(v_event_id) then
    raise exception 'only the event owner can regenerate a guest token' using errcode = '42501';
  end if;

  delete from public.guest_credentials c where c.guest_id = p_guest_id;

  return query
  update public.guests g
     set token = public.generate_guest_token(), claimed_at = null, last_seen_at = null
   where g.id = p_guest_id
  returning g.*;
end;
$$;

revoke execute on function public.regenerate_guest_token(uuid) from public, anon;
grant execute on function public.regenerate_guest_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 20261015100009_camera_assets.sql
-- ---------------------------------------------------------------------------
-- Marcos y stickers de la camara, definidos por el organizador de cada evento
-- (docs/fase-1-mvp-multitenant/marcos-y-stickers.md).
--
--   event_frames    marcos PARAMETRICOS: una plantilla + colores/textos editables.
--                   Se dibujan con Canvas, no son imagenes: no hay archivos.
--   event_stickers  emojis (texto) o imagenes subidas por el organizador.
--
-- El invitado nunca escribe aqui: solo lee, via list_event_camera_assets.

-- ---------------------------------------------------------------------------
-- Validacion de los parametros de un marco. Se hace en la base (no solo en el
-- cliente) para que nadie pueda guardar textos gigantes, colores raros o
-- claves desconocidas que despues se dibujen en la camara de los invitados.
-- ---------------------------------------------------------------------------
create or replace function public.valid_frame_params(p jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= 2048
    and not exists (
      select 1 from jsonb_object_keys(p) k
      where k not in ('primaryColor', 'secondaryColor', 'textColor', 'title', 'subtitle',
                      'caption', 'font', 'thickness', 'radius', 'position')
    )
    and (not (p ? 'primaryColor')
         or (jsonb_typeof(p -> 'primaryColor') = 'string' and (p ->> 'primaryColor') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (p ? 'secondaryColor')
         or (jsonb_typeof(p -> 'secondaryColor') = 'string' and (p ->> 'secondaryColor') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (p ? 'textColor')
         or (jsonb_typeof(p -> 'textColor') = 'string' and (p ->> 'textColor') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (p ? 'title')
         or (jsonb_typeof(p -> 'title') = 'string' and char_length(p ->> 'title') <= 60))
    and (not (p ? 'subtitle')
         or (jsonb_typeof(p -> 'subtitle') = 'string' and char_length(p ->> 'subtitle') <= 60))
    and (not (p ? 'caption')
         or (jsonb_typeof(p -> 'caption') = 'string' and char_length(p ->> 'caption') <= 60))
    and (not (p ? 'font')
         or (jsonb_typeof(p -> 'font') = 'string'
             and (p ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter')))
    and (not (p ? 'thickness')
         or (jsonb_typeof(p -> 'thickness') = 'number' and (p ->> 'thickness')::numeric between 0 and 1))
    and (not (p ? 'radius')
         or (jsonb_typeof(p -> 'radius') = 'number' and (p ->> 'radius')::numeric between 0 and 1))
    and (not (p ? 'position')
         or (jsonb_typeof(p -> 'position') = 'string' and (p ->> 'position') in ('top', 'bottom')));
$$;

create table public.event_frames (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  template text not null
    check (template in ('border', 'polaroid', 'film', 'viewfinder', 'banner', 'glow')),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  params jsonb not null default '{}',
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_frames_params_valid check (public.valid_frame_params(params)),
  -- Permite la clave foranea compuesta desde events.default_frame_id.
  constraint event_frames_id_event_unique unique (id, event_id)
);

create index event_frames_event_idx on public.event_frames (event_id, sort_order);

create trigger event_frames_set_updated_at
  before update on public.event_frames
  for each row execute function public.set_updated_at();

create table public.event_stickers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('emoji', 'image')),
  emoji text check (emoji is null or char_length(emoji) between 1 and 32),
  storage_path text,
  label text check (label is null or char_length(label) <= 60),
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint event_stickers_kind_data check (
    (kind = 'emoji' and emoji is not null and storage_path is null)
    or (kind = 'image' and storage_path is not null and emoji is null)
  ),
  -- Las imagenes viven en {event_id}/stickers/…: nunca en la carpeta de otro evento.
  constraint event_stickers_path_in_event check (
    storage_path is null or storage_path like event_id::text || '/stickers/%'
  )
);

create index event_stickers_event_idx on public.event_stickers (event_id, sort_order);

-- Topes por evento: cuidan el almacenamiento del plan gratuito y mantienen la
-- camara usable.
create or replace function public.enforce_camera_asset_limit()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'event_frames' then
    if (select count(*) from public.event_frames f where f.event_id = new.event_id) >= 20 then
      raise exception 'frame limit reached' using errcode = '53400';
    end if;
  else
    if (select count(*) from public.event_stickers s where s.event_id = new.event_id) >= 40 then
      raise exception 'sticker limit reached' using errcode = '53400';
    end if;
  end if;
  return new;
end;
$$;

create trigger event_frames_limit
  before insert on public.event_frames
  for each row execute function public.enforce_camera_asset_limit();

create trigger event_stickers_limit
  before insert on public.event_stickers
  for each row execute function public.enforce_camera_asset_limit();

-- Ajustes globales de la camara en el evento.
alter table public.events
  add column frames_enabled boolean not null default true,
  add column stickers_enabled boolean not null default true,
  add column default_frame_id uuid;

-- El marco por defecto tiene que ser de ESTE evento; si se borra el marco, el
-- evento queda sin marco por defecto (solo se anula esa columna).
alter table public.events
  add constraint events_default_frame_fk
  foreign key (default_frame_id, id) references public.event_frames (id, event_id)
  on delete set null (default_frame_id);

-- Solo el dueno del evento escribe; el invitado lee unicamente por RPC.
alter table public.event_frames enable row level security;
alter table public.event_stickers enable row level security;
revoke all on public.event_frames from anon, authenticated;
revoke all on public.event_stickers from anon, authenticated;
grant select, insert, update, delete on public.event_frames to authenticated;
grant select, insert, update, delete on public.event_stickers to authenticated;

create policy "owner_all" on public.event_frames
  for all
  to authenticated
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

create policy "owner_all" on public.event_stickers
  for all
  to authenticated
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

-- ---------------------------------------------------------------------------
-- Lectura del invitado: solo lo ACTIVO de SU evento, respetando los
-- interruptores globales (frames_enabled / stickers_enabled).
-- ---------------------------------------------------------------------------
create or replace function public.list_event_camera_assets(p_token text)
returns table (
  asset_type text,
  id uuid,
  label text,
  template text,
  params jsonb,
  emoji text,
  storage_path text,
  sort_order int,
  is_default boolean
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select 'frame'::text, f.id, f.label, f.template, f.params, null::text, null::text, f.sort_order,
         (e.default_frame_id = f.id)
  from public._approved_guest(p_token) g
  join public.events e on e.id = g.event_id
  join public.event_frames f on f.event_id = e.id
  where e.frames_enabled and f.enabled
  union all
  select 'sticker'::text, s.id, s.label, null::text, null::jsonb, s.emoji, s.storage_path, s.sort_order,
         false
  from public._approved_guest(p_token) g
  join public.events e on e.id = g.event_id
  join public.event_stickers s on s.event_id = e.id
  where e.stickers_enabled and s.enabled
  order by 1, 8;
$$;

grant execute on function public.list_event_camera_assets(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Un evento nuevo arranca con unos marcos y emojis de ejemplo (editables) para
-- que la camara no quede vacia. Trigger, asi vale venga el evento de donde venga.
-- ---------------------------------------------------------------------------
create or replace function public.seed_event_camera()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_title text := left(btrim(new.name), 60);
begin
  insert into public.event_frames (event_id, template, label, params, sort_order) values
    (new.id, 'border', 'Borde',
     jsonb_build_object('primaryColor', '#ff4fa3', 'thickness', 0.04, 'radius', 0.05), 0),
    (new.id, 'polaroid', 'Polaroid',
     jsonb_build_object('primaryColor', '#ffffff', 'textColor', '#222222', 'caption', v_title, 'font', 'hand'), 1),
    (new.id, 'banner', 'Titulo',
     jsonb_build_object('primaryColor', '#111111', 'textColor', '#ffffff', 'title', v_title,
                        'font', 'display', 'position', 'bottom'), 2);

  insert into public.event_stickers (event_id, kind, emoji, sort_order) values
    (new.id, 'emoji', U&'\+01F389', 0),
    (new.id, 'emoji', U&'\+01F382', 1),
    (new.id, 'emoji', U&'\+002764\+00FE0F', 2),
    (new.id, 'emoji', U&'\+01F4F8', 3),
    (new.id, 'emoji', U&'\+01F973', 4),
    (new.id, 'emoji', U&'\+002728', 5);

  return new;
end;
$$;

revoke execute on function public.seed_event_camera() from public, anon, authenticated;

create trigger events_seed_camera
  after insert on public.events
  for each row execute function public.seed_event_camera();

-- ---------------------------------------------------------------------------
-- Storage: imagenes de stickers. Ruta {event_id}/stickers/{archivo}.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('event-assets', 'event-assets', false)
on conflict (id) do nothing;

-- Un invitado solo puede ver (para firmar la URL) la imagen de un sticker que
-- esta ACTIVO en un evento con stickers habilitados.
create or replace function public.event_asset_is_public(p_path text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1
    from public.event_stickers s
    join public.events e on e.id = s.event_id
    where s.storage_path = p_path and s.enabled and e.stickers_enabled
  );
$$;

grant execute on function public.event_asset_is_public(text) to anon, authenticated;

create policy "owner_event_assets" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'event-assets' and public.storage_event_owner((storage.foldername(name))[1]))
  with check (bucket_id = 'event-assets' and public.storage_event_owner((storage.foldername(name))[1]));

create policy "public_read_active_stickers" on storage.objects
  for select
  to anon
  using (bucket_id = 'event-assets' and public.event_asset_is_public(name));

-- ---------------------------------------------------------------------------
-- 20261018100010_client_briefs.sql
-- ---------------------------------------------------------------------------
-- Formularios de opciones para clientes (p. ej. la persona que cumple anos
-- elige estilo, paleta y marcos antes de armar su evento). La modalidad se va
-- a repetir, asi que una sola tabla guarda las respuestas de todos los
-- formularios, distinguidos por slug.
--
-- Nadie lee esta tabla desde la app: no tiene politicas ni privilegios para
-- anon ni authenticated (un organizador no debe ver lo que responde el
-- cliente de otro). Las respuestas se leen desde el Table Editor de Supabase.
-- La unica via de escritura es submit_client_brief, que valida y limita.
create table public.client_briefs (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  -- Nombre de quien responde (opcional), solo para identificar la respuesta.
  respondent text check (respondent is null or char_length(respondent) <= 80),
  -- { <id de pregunta>: { pregunta, elegidas: [...], nota } }
  answers jsonb not null
    check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 20000),
  created_at timestamptz not null default now()
);

create index client_briefs_slug_created_idx
  on public.client_briefs (slug, created_at desc);

alter table public.client_briefs enable row level security;
revoke all on public.client_briefs from public, anon, authenticated;

-- Guarda una respuesta. Tope por formulario y total para que un enlace
-- publico no sirva para llenar la tabla.
create or replace function public.submit_client_brief(
  p_slug text,
  p_respondent text,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_respondent text := nullif(btrim(coalesce(p_respondent, '')), '');
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) not between 3 and 60 then
    raise exception 'invalid brief slug' using errcode = '22023';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 20000 then
    raise exception 'invalid brief answers' using errcode = '22023';
  end if;

  if v_respondent is not null and char_length(v_respondent) > 80 then
    raise exception 'respondent too long' using errcode = '22023';
  end if;

  if (select count(*) from public.client_briefs b where b.slug = p_slug) >= 200
     or (select count(*) from public.client_briefs) >= 2000 then
    raise exception 'too many briefs' using errcode = '54000';
  end if;

  insert into public.client_briefs (slug, respondent, answers)
  values (p_slug, v_respondent, p_answers)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_client_brief(text, text, jsonb) from public;
grant execute on function public.submit_client_brief(text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 20261018100011_frame_layers.sql
-- ---------------------------------------------------------------------------
-- Plantilla de marcos `capas`: un marco libre hecho de capas apiladas (texto,
-- formas, imagenes y emojis), dibujado con Canvas.
-- Ver src/lib/cameraAssets/layers.ts: la regla de validacion VIVE alli y esta
-- migracion la replica; un test de la suite de base de datos compara ambas.
--
--   * event_frames acepta la plantilla 'capas'.
--   * params admite la clave 'layers' (lista de capas), solo en esa plantilla.
--   * La validacion de cada capa se hace en la base, no solo en el cliente: nadie
--     puede guardar capas con claves ajenas, colores raros, trazos con comandos
--     fuera de la lista blanca ni imagenes de otro evento.
--   * Las imagenes de las capas viven en {event_id}/frames/{archivo} del bucket
--     event-assets y un invitado las puede leer mientras el marco este activo.

-- ---------------------------------------------------------------------------
-- Ayudantes: devuelven true si la clave falta o es valida. Usan CASE porque SQL
-- no garantiza el orden de un AND y el cast a numeric fallaria con un texto.
-- ---------------------------------------------------------------------------
create or replace function public._frame_num(j jsonb, k text, lo numeric, hi numeric)
returns boolean
language sql
immutable
as $$
  select case
    when not (j ? k) then true
    when jsonb_typeof(j -> k) = 'number' then (j ->> k)::numeric between lo and hi
    else false
  end;
$$;

create or replace function public._frame_color(j jsonb, k text)
returns boolean
language sql
immutable
as $$
  select case
    when not (j ? k) then true
    when jsonb_typeof(j -> k) = 'string' then (j ->> k) ~ '^#[0-9a-fA-F]{6}$'
    else false
  end;
$$;

-- La sombra lleva sus cuatro campos.
create or replace function public._frame_shadow(s jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(s) = 'object'
    and not exists (select 1 from jsonb_object_keys(s) k where k not in ('color', 'blur', 'x', 'y'))
    and s ? 'color' and s ? 'blur' and s ? 'x' and s ? 'y'
    and public._frame_color(s, 'color')
    and public._frame_num(s, 'blur', 0, 0.2)
    and public._frame_num(s, 'x', -0.2, 0.2)
    and public._frame_num(s, 'y', -0.2, 0.2),
    false);
$$;

-- ---------------------------------------------------------------------------
-- Una capa. p_event es el evento dueno del marco: las imagenes tienen que estar
-- en SU carpeta.
-- ---------------------------------------------------------------------------
create or replace function public.valid_frame_layer(x jsonb, p_event uuid)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(x) = 'object'
    and (x ->> 'type') in ('text', 'shape', 'image', 'emoji')
    and not exists (
      select 1 from jsonb_object_keys(x) k
      where k not in ('type', 'x', 'y', 'rotation', 'opacity', 'anchor', 'shadow')
        and k not in (
          select unnest(case x ->> 'type'
            when 'text' then array['text', 'size', 'font', 'color', 'weight', 'w', 'strokeColor', 'strokeWidth']
            when 'shape' then array['shape', 'w', 'h', 'fill', 'stroke', 'strokeWidth', 'radius', 'd']
            when 'image' then array['src', 'w', 'h', 'full']
            else array['emoji', 'size']
          end))
    )
    and public._frame_num(x, 'x', -1, 2)
    and public._frame_num(x, 'y', -1, 2)
    and public._frame_num(x, 'rotation', -360, 360)
    and public._frame_num(x, 'opacity', 0, 1)
    and (not (x ? 'anchor') or (x ->> 'anchor') in ('center', 'tl', 'tr', 'bl', 'br'))
    and (not (x ? 'shadow') or public._frame_shadow(x -> 'shadow'))
    and case x ->> 'type'
      when 'text' then
        jsonb_typeof(x -> 'text') = 'string'
        and char_length(btrim(x ->> 'text')) >= 1
        and char_length(x ->> 'text') <= 60
        and public._frame_num(x, 'size', 0.005, 1)
        -- Las del sistema y las web de las capas (ver LAYER_FONTS en src/lib/cameraAssets/text.ts).
        and (not (x ? 'font') or (x ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter',
                                                    'anton', 'playfair', 'pacifico', 'marker', 'elite'))
        and public._frame_color(x, 'color')
        and (not (x ? 'weight') or (x ->> 'weight') in ('normal', 'bold'))
        and public._frame_num(x, 'w', 0.05, 4)
        and public._frame_color(x, 'strokeColor')
        and public._frame_num(x, 'strokeWidth', 0, 0.2)
      when 'shape' then
        (x ->> 'shape') in ('rect', 'ellipse', 'line', 'path')
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and public._frame_color(x, 'fill')
        and public._frame_color(x, 'stroke')
        and public._frame_num(x, 'strokeWidth', 0, 0.2)
        and public._frame_num(x, 'radius', 0, 1)
        and case
          when (x ->> 'shape') = 'path' then
            jsonb_typeof(x -> 'd') = 'string'
            and char_length(x ->> 'd') between 1 and 600
            and (x ->> 'd') ~ '^[MLCZ0-9.,[:space:]-]+$'
          else not (x ? 'd')
        end
      when 'image' then
        jsonb_typeof(x -> 'src') = 'string'
        and (x ->> 'src') ~ ('^' || p_event::text || '/frames/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$')
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and (not (x ? 'full') or jsonb_typeof(x -> 'full') = 'boolean')
        and (
          (x -> 'full') = 'true'::jsonb
          or (jsonb_typeof(x -> 'w') = 'number' and jsonb_typeof(x -> 'h') = 'number')
        )
      else
        jsonb_typeof(x -> 'emoji') = 'string'
        and char_length(x ->> 'emoji') between 1 and 32
        and public._frame_num(x, 'size', 0.01, 1)
    end,
    false);
$$;

-- La lista completa: hasta 40 capas. Sin la clave 'layers' (null) vale.
create or replace function public.valid_frame_layers(l jsonb, p_event uuid)
returns boolean
language sql
immutable
as $$
  select case
    when l is null then true
    when jsonb_typeof(l) <> 'array' then false
    when jsonb_array_length(l) > 40 then false
    else not exists (select 1 from jsonb_array_elements(l) e where not public.valid_frame_layer(e, p_event))
  end;
$$;

-- ---------------------------------------------------------------------------
-- valid_frame_params: ahora admite 'layers' y, solo con ella, un tope de 32 KB.
-- El cliente limita a 16384 caracteres del JSON compacto (MAX_LAYERS_PARAMS_LENGTH);
-- aqui se mide jsonb::text, que agrega espacios y cuenta bytes, asi que el tope
-- es mayor para que el cliente rechace SIEMPRE antes que la base.
-- ---------------------------------------------------------------------------
create or replace function public.valid_frame_params(p jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= case when p ? 'layers' then 32768 else 2048 end
    and not exists (
      select 1 from jsonb_object_keys(p) k
      where k not in ('primaryColor', 'secondaryColor', 'textColor', 'title', 'subtitle',
                      'caption', 'font', 'thickness', 'radius', 'position', 'layers')
    )
    and (not (p ? 'primaryColor')
         or (jsonb_typeof(p -> 'primaryColor') = 'string' and (p ->> 'primaryColor') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (p ? 'secondaryColor')
         or (jsonb_typeof(p -> 'secondaryColor') = 'string' and (p ->> 'secondaryColor') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (p ? 'textColor')
         or (jsonb_typeof(p -> 'textColor') = 'string' and (p ->> 'textColor') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (p ? 'title')
         or (jsonb_typeof(p -> 'title') = 'string' and char_length(p ->> 'title') <= 60))
    and (not (p ? 'subtitle')
         or (jsonb_typeof(p -> 'subtitle') = 'string' and char_length(p ->> 'subtitle') <= 60))
    and (not (p ? 'caption')
         or (jsonb_typeof(p -> 'caption') = 'string' and char_length(p ->> 'caption') <= 60))
    and (not (p ? 'font')
         or (jsonb_typeof(p -> 'font') = 'string'
             and (p ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter')))
    and (not (p ? 'thickness')
         or (jsonb_typeof(p -> 'thickness') = 'number' and (p ->> 'thickness')::numeric between 0 and 1))
    and (not (p ? 'radius')
         or (jsonb_typeof(p -> 'radius') = 'number' and (p ->> 'radius')::numeric between 0 and 1))
    and (not (p ? 'position')
         or (jsonb_typeof(p -> 'position') = 'string' and (p ->> 'position') in ('top', 'bottom')))
    and (not (p ? 'layers') or jsonb_typeof(p -> 'layers') = 'array');
$$;

-- ---------------------------------------------------------------------------
-- event_frames: plantilla nueva y reglas que dependen de la fila.
-- ---------------------------------------------------------------------------
alter table public.event_frames drop constraint event_frames_template_check;
alter table public.event_frames
  add constraint event_frames_template_check
  check (template in ('border', 'polaroid', 'film', 'viewfinder', 'banner', 'glow', 'capas'));

-- Las capas solo existen en la plantilla 'capas' (asi las otras siguen en 2 KB).
alter table public.event_frames
  add constraint event_frames_layers_only_capas
  check (template = 'capas' or not (params ? 'layers'));

-- Cada capa valida y las imagenes dentro de la carpeta de ESTE evento.
alter table public.event_frames
  add constraint event_frames_layers_valid
  check (public.valid_frame_layers(params -> 'layers', event_id));

-- ---------------------------------------------------------------------------
-- Storage: un invitado puede leer (para firmar la URL) la imagen de una capa de
-- un marco ACTIVO en un evento con marcos habilitados, ademas de las de los
-- stickers activos. Mismas condiciones que antes para los stickers.
-- ---------------------------------------------------------------------------
create or replace function public.event_asset_is_public(p_path text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1
    from public.event_stickers s
    join public.events e on e.id = s.event_id
    where s.storage_path = p_path and s.enabled and e.stickers_enabled
  ) or exists (
    select 1
    from public.event_frames f
    join public.events e on e.id = f.event_id
    where f.enabled and e.frames_enabled and f.template = 'capas'
      and p_path like f.event_id::text || '/frames/%'
      and exists (
        select 1 from jsonb_array_elements(coalesce(f.params -> 'layers', '[]'::jsonb)) l
        where l ->> 'type' = 'image' and l ->> 'src' = p_path
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 20261023100012_enrollment_config.sql
-- ---------------------------------------------------------------------------
-- Inscripcion configurable por el organizador.
-- Ver src/lib/enrollmentConfig.ts: la regla de validacion VIVE alli y esta
-- migracion la replica; un test de la suite de base de datos compara ambas.
--
--   * events.enrollment_config: que le pide el organizador al invitado al
--     inscribirse (+1, comentario, hasta 3 preguntas propias, bienvenida).
--     La presencia de una clave la activa; '{}' no pide nada. El organizador la
--     guarda con un update directo (la politica "owner_all" ya se lo permite) y
--     la restriccion CHECK es la que manda.
--   * events.default_photo_quota: disparos por invitado nuevo (antes fijo en 5).
--   * guests.guest_answers / plus_ones_requested: lo que respondio la persona. Los
--     acompanantes son una SOLICITUD: el organizador los aprueba despues.
--     Son preguntas de la fiesta: nada pide ni guarda RUT, correo, telefono ni PIN.
--   * register_guest recibe las respuestas (p_answers, opcional: los llamados
--     de 3 argumentos siguen funcionando) y rechaza lo que no esta configurado o
--     falta si es obligatorio.
--   * get_event_public entrega la configuracion para armar el formulario.

-- ---------------------------------------------------------------------------
-- Validacion de la configuracion (claves cerradas, largos acotados).
-- ---------------------------------------------------------------------------
-- Recorta con la misma lista de espacios que String.prototype.trim de JavaScript (incluye NBSP y BOM).
-- \s de Postgres depende de la collation de la base y recorta distinto: sin esto, el cliente y la base
-- discreparían sobre qué es un texto "vacío".
create or replace function public._enroll_trim(s text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    s,
    '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
    '',
    'g'
  );
$$;

-- ¿La pregunta pide un dato que esta plataforma no guarda (RUT, correo, teléfono, claves)? Compara sin tildes,
-- en minúsculas y por palabra completa ("pintura" no es "pin"). La misma regla vive en enrollmentConfig.ts.
create or replace function public._enroll_asks_personal_data(label text)
returns boolean
language sql
immutable
as $$
  select translate(lower(label), 'áéíóúüñ', 'aeiouun')
    ~ '\m(rut|run|dni|cedula|pasaporte|correo|email|mail|telefono|celular|fono|whatsapp|pin|clave|contrasena|password)\M';
$$;

create or replace function public._enroll_text(j jsonb, k text, max_len int)
returns boolean
language sql
immutable
as $$
  select case
    when not (j ? k) then false
    when jsonb_typeof(j -> k) = 'string'
      then char_length(public._enroll_trim(j ->> k)) between 1 and max_len
    else false
  end;
$$;

create or replace function public.valid_enrollment_config(c jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  k text;
  p jsonb;
  q jsonb;
  seen text[] := '{}';
begin
  if c is null or jsonb_typeof(c) <> 'object' then
    return false;
  end if;

  for k in select jsonb_object_keys(c) loop
    if k not in ('welcome', 'plus_ones', 'comment', 'questions') then
      return false;
    end if;
  end loop;

  if c ? 'welcome' and not public._enroll_text(c, 'welcome', 400) then
    return false;
  end if;

  if c ? 'plus_ones' then
    p := c -> 'plus_ones';
    if jsonb_typeof(p) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(p) loop
      if k <> 'max' then return false; end if;
    end loop;
    if not (p ? 'max') or jsonb_typeof(p -> 'max') <> 'number' then return false; end if;
    if (p ->> 'max')::numeric <> trunc((p ->> 'max')::numeric)
       or (p ->> 'max')::numeric not between 1 and 5 then
      return false;
    end if;
  end if;

  if c ? 'comment' then
    p := c -> 'comment';
    if jsonb_typeof(p) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(p) loop
      if k not in ('label', 'required') then return false; end if;
    end loop;
    if not public._enroll_text(p, 'label', 120) or public._enroll_asks_personal_data(p ->> 'label') then return false; end if;
    if not (p ? 'required') or jsonb_typeof(p -> 'required') <> 'boolean' then return false; end if;
  end if;

  if c ? 'questions' then
    p := c -> 'questions';
    if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 3 then return false; end if;
    for q in select * from jsonb_array_elements(p) loop
      if jsonb_typeof(q) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(q) loop
        if k not in ('id', 'label', 'required') then return false; end if;
      end loop;
      if not (q ? 'id') or jsonb_typeof(q -> 'id') <> 'string' then return false; end if;
      if (q ->> 'id') not in ('q1', 'q2', 'q3') or (q ->> 'id') = any (seen) then return false; end if;
      if not public._enroll_text(q, 'label', 80) or public._enroll_asks_personal_data(q ->> 'label') then return false; end if;
      if not (q ? 'required') or jsonb_typeof(q -> 'required') <> 'boolean' then return false; end if;
      seen := seen || (q ->> 'id');
    end loop;
  end if;

  return true;
end;
$$;

-- Forma de lo guardado en guests.guest_answers (lo escribe register_guest, pero
-- el organizador tambien puede actualizar su tabla: la base no confia en nadie).
create or replace function public.valid_guest_answers(a jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  k text;
  el jsonb;
begin
  if a is null or jsonb_typeof(a) <> 'object' or octet_length(a::text) > 8000 then
    return false;
  end if;
  for k in select jsonb_object_keys(a) loop
    if k not in ('plus_ones', 'comment', 'q1', 'q2', 'q3') then return false; end if;
  end loop;
  if a ? 'plus_ones' then
    if jsonb_typeof(a -> 'plus_ones') <> 'array' or jsonb_array_length(a -> 'plus_ones') > 5 then return false; end if;
    for el in select * from jsonb_array_elements(a -> 'plus_ones') loop
      if jsonb_typeof(el) <> 'string' or char_length(el #>> '{}') not between 1 and 80 then return false; end if;
    end loop;
  end if;
  for k in select unnest(array['comment', 'q1', 'q2', 'q3']) loop
    if a ? k and (jsonb_typeof(a -> k) <> 'string' or char_length(a ->> k) not between 1 and 280) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Columnas.
-- ---------------------------------------------------------------------------
alter table public.events
  add column enrollment_config jsonb not null default '{}'::jsonb,
  add column default_photo_quota int not null default 5,
  add constraint events_enrollment_config_valid check (public.valid_enrollment_config(enrollment_config)),
  add constraint events_default_photo_quota_range check (default_photo_quota between 0 and 100);

alter table public.guests
  add column guest_answers jsonb not null default '{}'::jsonb,
  add column plus_ones_requested int not null default 0,
  add constraint guests_answers_valid check (public.valid_guest_answers(guest_answers)),
  add constraint guests_plus_ones_requested_range check (plus_ones_requested between 0 and 5);

-- ---------------------------------------------------------------------------
-- _clean_enrollment_answers: valida y normaliza las respuestas contra la
-- configuracion del evento. Lanza 'enrollment_invalid:<codigo>[:<campo>]'
-- (errcode 22023). Mismo orden de comprobaciones que cleanEnrollmentAnswers.
-- ---------------------------------------------------------------------------
create or replace function public._clean_enrollment_answers(c jsonb, a jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  k text;
  v jsonb;
  el jsonb;
  q jsonb;
  qid text;
  s text;
  names jsonb := '[]'::jsonb;
  out jsonb := '{}'::jsonb;
  configured text[] := '{}';
begin
  c := coalesce(c, '{}'::jsonb);
  a := coalesce(a, '{}'::jsonb);
  if jsonb_typeof(a) = 'null' then a := '{}'::jsonb; end if;
  if jsonb_typeof(a) <> 'object' then
    raise exception 'enrollment_invalid:answers' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(a) loop
    if k not in ('plus_ones', 'comment', 'q1', 'q2', 'q3') then
      raise exception 'enrollment_invalid:unknown_key' using errcode = '22023';
    end if;
  end loop;

  -- +1: lista de nombres.
  v := a -> 'plus_ones';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'array' then
      raise exception 'enrollment_invalid:plus_ones_invalid' using errcode = '22023';
    end if;
    if jsonb_array_length(v) > 0 then
      if not (c ? 'plus_ones') then
        raise exception 'enrollment_invalid:plus_ones_disabled' using errcode = '22023';
      end if;
      if jsonb_array_length(v) > (c #>> '{plus_ones,max}')::numeric then
        raise exception 'enrollment_invalid:plus_ones_too_many' using errcode = '22023';
      end if;
      for el in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(el) <> 'string' then
          raise exception 'enrollment_invalid:plus_one_name' using errcode = '22023';
        end if;
        s := public._enroll_trim(el #>> '{}');
        if char_length(s) not between 1 and 80 then
          raise exception 'enrollment_invalid:plus_one_name' using errcode = '22023';
        end if;
        names := names || to_jsonb(s);
      end loop;
      out := out || jsonb_build_object('plus_ones', names);
    end if;
  end if;

  -- Comentario.
  v := a -> 'comment';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'string' then
      raise exception 'enrollment_invalid:comment_invalid' using errcode = '22023';
    end if;
    s := public._enroll_trim(v #>> '{}');
    if s <> '' then
      if not (c ? 'comment') then
        raise exception 'enrollment_invalid:comment_disabled' using errcode = '22023';
      end if;
      if char_length(s) > 280 then
        raise exception 'enrollment_invalid:comment_too_long' using errcode = '22023';
      end if;
      out := out || jsonb_build_object('comment', s);
    end if;
  end if;
  if c ? 'comment' and (c #>> '{comment,required}')::boolean and not (out ? 'comment') then
    raise exception 'enrollment_invalid:comment_required' using errcode = '22023';
  end if;

  -- Preguntas propias, en el orden de la configuracion.
  for q in select * from jsonb_array_elements(coalesce(c -> 'questions', '[]'::jsonb)) loop
    qid := q ->> 'id';
    configured := configured || qid;
    v := a -> qid;
    if v is not null and jsonb_typeof(v) <> 'null' then
      if jsonb_typeof(v) <> 'string' then
        raise exception 'enrollment_invalid:question_invalid:%', qid using errcode = '22023';
      end if;
      s := public._enroll_trim(v #>> '{}');
      if s <> '' then
        if char_length(s) > 140 then
          raise exception 'enrollment_invalid:question_too_long:%', qid using errcode = '22023';
        end if;
        out := out || jsonb_build_object(qid, s);
      end if;
    end if;
    if (q ->> 'required')::boolean and not (out ? qid) then
      raise exception 'enrollment_invalid:question_required:%', qid using errcode = '22023';
    end if;
  end loop;

  -- Respuesta a una pregunta que no existe (o ya no existe) en este evento.
  foreach qid in array array['q1', 'q2', 'q3'] loop
    v := a -> qid;
    if not (qid = any (configured)) and v is not null and jsonb_typeof(v) <> 'null' then
      if jsonb_typeof(v) = 'string' and public._enroll_trim(v #>> '{}') = '' then
        continue;
      end if;
      raise exception 'enrollment_invalid:question_unknown:%', qid using errcode = '22023';
    end if;
  end loop;

  return out;
end;
$$;

-- Guarda las respuestas. Los acompanantes que el invitado escribe son una SOLICITUD
-- (plus_ones_requested): no cuentan en el aforo ni en la puerta hasta que el
-- organizador los aprueba (plus_ones_allowed / plus_ones_confirmed). Interno.
create or replace function public._apply_enrollment(p_guest_id uuid, p_answers jsonb)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.guests g
     set guest_answers = p_answers,
         plus_ones_requested = coalesce(jsonb_array_length(p_answers -> 'plus_ones'), 0)
   where g.id = p_guest_id;
$$;

revoke execute on function public._clean_enrollment_answers(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public._apply_enrollment(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_event_public: ahora tambien entrega la configuracion de la inscripcion.
-- Cambia el tipo de retorno, por eso se recrea.
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
  enrollment_config jsonb
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select e.id, e.name, e.starts_at, e.location, e.rsvp_deadline, e.access_mode,
         e.camera_unlock, e.rsvp_enabled, (e.photos_revealed_at is not null), e.enrollment_config
  from public.events e
  where e.slug = p_slug;
$$;

grant execute on function public.get_event_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- register_guest: ahora acepta las respuestas de la inscripcion.
-- outcome: ok | pending_approval | name_taken | not_found | ambiguous
-- Respuestas invalidas: error 22023 'enrollment_invalid:<codigo>' (no cuentan
-- como intento fallido: no revelan nada de quien esta inscrito).
-- ---------------------------------------------------------------------------
drop function public.register_guest(text, text, text);

create function public.register_guest(p_slug text, p_name text, p_pin text, p_answers jsonb default null)
returns table (
  outcome text,
  guest_token text,
  guest_id uuid,
  guest_name text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_event public.events%rowtype;
  v_tokens text[];
  v_clean text;
  v_key text := public.request_client_key();
  v_ids uuid[];
  v_guest public.guests%rowtype;
  v_answers jsonb;
begin
  select * into v_event from public.events e where e.slug = p_slug;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'pin must be 4 to 6 digits' using errcode = '22023';
  end if;

  v_tokens := public.name_tokens(p_name);
  if cardinality(v_tokens) < 2 then
    raise exception 'name must include first name and last name' using errcode = '22023';
  end if;
  v_clean := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));

  v_answers := public._clean_enrollment_answers(v_event.enrollment_config, p_answers);

  perform public._guard_attempts(v_event.id, v_key);

  -- ---- Abierto ---------------------------------------------------------
  if v_event.access_mode = 'open' then
    select * into v_guest from public.guests g
     where g.event_id = v_event.id and g.name_tokens = v_tokens;

    if found then
      -- Ya existe: solo se puede reclamar si no tiene PIN (p. ej. el
      -- organizador restablecio su acceso).
      if v_guest.approval_status <> 'approved'
         or exists (select 1 from public.guest_credentials c where c.guest_id = v_guest.id) then
        perform public._record_failure(v_event.id, v_key);
        return query select 'name_taken'::text, null::text, null::uuid, null::text;
        return;
      end if;
    else
      -- Tope por evento: frena la creacion masiva de invitados falsos.
      if (select count(*) from public.guests g where g.event_id = v_event.id) >= 500 then
        raise exception 'event guest limit reached' using errcode = '53400';
      end if;

      begin
        insert into public.guests (event_id, full_name, photo_quota)
        values (v_event.id, v_clean, v_event.default_photo_quota)
        returning * into v_guest;
      exception when unique_violation then
        perform public._record_failure(v_event.id, v_key);
        return query select 'name_taken'::text, null::text, null::uuid, null::text;
        return;
      end;
    end if;

    perform public._set_credentials(v_guest.id, p_pin);
    perform public._apply_enrollment(v_guest.id, v_answers);
    update public.guests g
       set claimed_at = coalesce(g.claimed_at, now()), last_seen_at = now()
     where g.id = v_guest.id
    returning * into v_guest;

    return query select 'ok'::text, v_guest.token, v_guest.id, v_guest.full_name;
    return;
  end if;

  -- ---- Con lista -------------------------------------------------------
  v_ids := array(
    select g.id from public.guests g
     where g.event_id = v_event.id
       and g.approval_status <> 'rejected'
       and g.name_tokens @> v_tokens
  );

  if cardinality(v_ids) > 1 then
    perform public._record_failure(v_event.id, v_key);
    return query select 'ambiguous'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if cardinality(v_ids) = 1 then
    select * into v_guest from public.guests g where g.id = v_ids[1];

    if exists (select 1 from public.guest_credentials c where c.guest_id = v_guest.id) then
      perform public._record_failure(v_event.id, v_key);
      return query select 'name_taken'::text, null::text, null::uuid, null::text;
      return;
    end if;

    perform public._set_credentials(v_guest.id, p_pin);
    perform public._apply_enrollment(v_guest.id, v_answers);
    if v_guest.approval_status = 'pending' then
      return query select 'pending_approval'::text, null::text, v_guest.id, v_guest.full_name;
      return;
    end if;

    update public.guests g
       set claimed_at = coalesce(g.claimed_at, now()), last_seen_at = now()
     where g.id = v_guest.id
    returning * into v_guest;

    return query select 'ok'::text, v_guest.token, v_guest.id, v_guest.full_name;
    return;
  end if;

  -- No esta en la lista.
  perform public._record_failure(v_event.id, v_key);

  if v_event.access_mode = 'list_requests' then
    if (select count(*) from public.guests g
         where g.event_id = v_event.id and g.approval_status = 'pending') >= 50 then
      raise exception 'too many pending access requests' using errcode = '53400';
    end if;

    begin
      insert into public.guests (event_id, full_name, approval_status, photo_quota)
      values (v_event.id, v_clean, 'pending', v_event.default_photo_quota)
      returning * into v_guest;
    exception when unique_violation then
      return query select 'name_taken'::text, null::text, null::uuid, null::text;
      return;
    end;

    perform public._set_credentials(v_guest.id, p_pin);
    perform public._apply_enrollment(v_guest.id, v_answers);
    return query select 'pending_approval'::text, null::text, v_guest.id, v_guest.full_name;
    return;
  end if;

  return query select 'not_found'::text, null::text, null::uuid, null::text;
end;
$$;

grant execute on function public.register_guest(text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_public_headcount: sin RSVP activado, la inscripcion ES la confirmacion.
-- Antes solo contaba status = 'confirmed', que en la Fase 1 nadie puede fijar
-- (no hay pantalla de RSVP), asi que el aforo del hub nunca aparecia. Ahora, si
-- el evento no usa RSVP, cuenta a quienes ya se inscribieron (claimed_at) y no
-- declinaron, con sus acompanantes (no a quien el organizador cargo y nunca
-- entro); con RSVP activado sigue contando solo a los confirmados.
-- ---------------------------------------------------------------------------
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
    and g.approval_status = 'approved'
    and (
      (e.rsvp_enabled and g.status = 'confirmed')
      or (not e.rsvp_enabled and g.claimed_at is not null and g.status <> 'declined')
    );
$$;

-- ---------------------------------------------------------------------------
-- 20261024100013_cartelera_activacion_tema.sql
-- ---------------------------------------------------------------------------
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

-- El tope por evento del inicio de sesion no debe contar los fallos de activacion (clave 'act:...').
create or replace function public._guard_attempts(p_event_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.identify_attempts a where a.attempted_at < now() - interval '1 hour';

  if (select count(*) from public.identify_attempts a
       where a.event_id = p_event_id and a.client_key = p_key
         and a.attempted_at > now() - interval '10 minutes') >= 30
     or (select count(*) from public.identify_attempts a
          where a.event_id = p_event_id
            and a.client_key not like 'act:%'
            and a.attempted_at > now() - interval '10 minutes') >= 200
  then
    raise exception 'too many attempts, try again later' using errcode = '53400';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activacion de la camara con el QR de la fiesta.
-- Devuelve false si el codigo no corresponde (cuenta como intento fallido: frena la fuerza bruta).
-- ---------------------------------------------------------------------------
-- Los codigos equivocados se cuentan APARTE del inicio de sesion y la inscripcion (clave 'act:<ip>'): un QR
-- viejo que muchos escanean desde el mismo wifi no puede bloquear a nadie para entrar. El tope es holgado
-- (200 por IP cada 10 minutos) porque el codigo tiene 122 bits: el limite solo evita llenar la tabla.
create or replace function public.activate_camera(p_token text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest public.guests%rowtype;
  v_code text;
  v_key text := 'act:' || public.request_client_key();
begin
  select * into v_guest from public._approved_guest(p_token);
  if not found then
    raise exception 'no guest matches this token' using errcode = 'P0002';
  end if;

  if (select count(*) from public.identify_attempts a
       where a.event_id = v_guest.event_id and a.client_key = v_key
         and a.attempted_at > now() - interval '10 minutes') >= 200 then
    raise exception 'too many attempts, try again later' using errcode = '53400';
  end if;

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
  order by p.created_at
  limit 1000;
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
-- La primera vez que publica algo tambien marca el evento como "con fotos reveladas" (lo que lee el hub).
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

  if v_count > 0 then
    update public.events e
       set photos_revealed_at = coalesce(e.photos_revealed_at, now())
     where e.id = p_event_id;
  end if;

  return v_count;
end;
$$;

revoke execute on function public.publish_photo_batch(uuid) from public, anon;
grant execute on function public.publish_photo_batch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 20261024100014_frame_layers_anclaje.sql
-- ---------------------------------------------------------------------------
-- Marcos por capas: anclaje a los bordes (dx, dy y box).
--
-- Hasta ahora una capa se ubicaba por fracciones del lienzo y todo lo demas se medía en "lado menor", asi que un
-- marco pensado para una foto vertical 3:4 no llegaba a los bordes en horizontal ni en una camara 9:16. Dos claves
-- opcionales lo resuelven (las capas que ya existen no cambian):
--   * dx, dy (todas las capas): desplazamiento desde (x, y), relativo al lado menor. Entre -2 y 2.
--   * box (solo rect y line): la forma queda pegada a los bordes del lienzo. Es un objeto con alguno de l, t, r, b
--     (margenes relativos al lado menor, entre 0 y 1); no puede estar vacio.
-- La misma regla vive en src/lib/cameraAssets/layers.ts (validateLayers) y supabase/tests/frame-layers.test.ts
-- prueba la misma tabla de casos contra las dos.

create or replace function public._frame_box(b jsonb)
returns boolean
language sql
immutable
as $$
  -- CASE y no AND: jsonb_object_keys falla con una lista o un escalar, y SQL no garantiza el orden de un AND.
  select case
    when jsonb_typeof(b) is distinct from 'object' then false
    else coalesce(
      exists (select 1 from jsonb_object_keys(b))
      and not exists (select 1 from jsonb_object_keys(b) k where k not in ('l', 't', 'r', 'b'))
      and public._frame_num(b, 'l', 0, 1)
      and public._frame_num(b, 't', 0, 1)
      and public._frame_num(b, 'r', 0, 1)
      and public._frame_num(b, 'b', 0, 1),
      false)
  end;
$$;

-- Una capa. p_event es el evento dueno del marco: las imagenes tienen que estar en SU carpeta.
create or replace function public.valid_frame_layer(x jsonb, p_event uuid)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(x) = 'object'
    and (x ->> 'type') in ('text', 'shape', 'image', 'emoji')
    and not exists (
      select 1 from jsonb_object_keys(x) k
      where k not in ('type', 'x', 'y', 'dx', 'dy', 'rotation', 'opacity', 'anchor', 'shadow')
        and k not in (
          select unnest(case x ->> 'type'
            when 'text' then array['text', 'size', 'font', 'color', 'weight', 'w', 'strokeColor', 'strokeWidth']
            when 'shape' then array['shape', 'w', 'h', 'fill', 'stroke', 'strokeWidth', 'radius', 'd', 'box']
            when 'image' then array['src', 'w', 'h', 'full']
            else array['emoji', 'size']
          end))
    )
    and public._frame_num(x, 'x', -1, 2)
    and public._frame_num(x, 'y', -1, 2)
    and public._frame_num(x, 'dx', -2, 2)
    and public._frame_num(x, 'dy', -2, 2)
    and public._frame_num(x, 'rotation', -360, 360)
    and public._frame_num(x, 'opacity', 0, 1)
    and (not (x ? 'anchor') or (x ->> 'anchor') in ('center', 'tl', 'tr', 'bl', 'br'))
    and (not (x ? 'shadow') or public._frame_shadow(x -> 'shadow'))
    and case x ->> 'type'
      when 'text' then
        jsonb_typeof(x -> 'text') = 'string'
        and char_length(btrim(x ->> 'text')) >= 1
        and char_length(x ->> 'text') <= 60
        and public._frame_num(x, 'size', 0.005, 1)
        -- Las del sistema y las web de las capas (ver LAYER_FONTS en src/lib/cameraAssets/text.ts).
        and (not (x ? 'font') or (x ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter',
                                                    'anton', 'playfair', 'pacifico', 'marker', 'elite'))
        and public._frame_color(x, 'color')
        and (not (x ? 'weight') or (x ->> 'weight') in ('normal', 'bold'))
        and public._frame_num(x, 'w', 0.05, 4)
        and public._frame_color(x, 'strokeColor')
        and public._frame_num(x, 'strokeWidth', 0, 0.2)
      when 'shape' then
        (x ->> 'shape') in ('rect', 'ellipse', 'line', 'path')
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and public._frame_color(x, 'fill')
        and public._frame_color(x, 'stroke')
        and public._frame_num(x, 'strokeWidth', 0, 0.2)
        and public._frame_num(x, 'radius', 0, 1)
        and (not (x ? 'box') or ((x ->> 'shape') in ('rect', 'line') and public._frame_box(x -> 'box')))
        and case
          when (x ->> 'shape') = 'path' then
            jsonb_typeof(x -> 'd') = 'string'
            and char_length(x ->> 'd') between 1 and 600
            and (x ->> 'd') ~ '^[MLCZ0-9.,[:space:]-]+$'
          else not (x ? 'd')
        end
      when 'image' then
        jsonb_typeof(x -> 'src') = 'string'
        and (x ->> 'src') ~ ('^' || p_event::text || '/frames/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$')
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and (not (x ? 'full') or jsonb_typeof(x -> 'full') = 'boolean')
        and (
          (x -> 'full') = 'true'::jsonb
          or (jsonb_typeof(x -> 'w') = 'number' and jsonb_typeof(x -> 'h') = 'number')
        )
      else
        jsonb_typeof(x -> 'emoji') = 'string'
        and char_length(x ->> 'emoji') between 1 and 32
        and public._frame_num(x, 'size', 0.01, 1)
    end,
    false);
$$;

-- ---------------------------------------------------------------------------
-- 20261024100015_submit_photo_idempotente.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 20261025100016_submit_photo_cupo_y_rutas.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 20261025100017_event_wishlist.sql
-- ---------------------------------------------------------------------------
-- Lista de deseos / regalos del evento (Fase 1)
-- Permite al organizador configurar enlaces a regalos con imagen extraída de OpenGraph,
-- título, precio o notas opcionales. Se almacena en events.wishlist como jsonb validado.

create or replace function public.valid_event_wishlist(w jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  k text;
  v_item jsonb;
  v_items jsonb;
  v_count int;
  v_url text;
  v_title text;
  v_img text;
  v_price text;
  v_notes text;
  v_id text;
  v_mode text;
begin
  if w is null or jsonb_typeof(w) <> 'object' then
    return false;
  end if;

  -- Solo se permiten las claves conocidas
  for k in select jsonb_object_keys(w) loop
    if k not in ('enabled', 'display_mode', 'title', 'items') then
      return false;
    end if;
  end loop;

  -- enabled: boolean obligatorio si está presente
  if w ? 'enabled' and jsonb_typeof(w -> 'enabled') <> 'boolean' then
    return false;
  end if;

  -- display_mode: chip, card o banner
  if w ? 'display_mode' then
    if jsonb_typeof(w -> 'display_mode') <> 'string' then
      return false;
    end if;
    v_mode := w ->> 'display_mode';
    if v_mode not in ('chip', 'card', 'banner') then
      return false;
    end if;
  end if;

  -- title: opcional, hasta 60 caracteres
  if w ? 'title' and w ->> 'title' is not null then
    if jsonb_typeof(w -> 'title') <> 'string' or char_length(btrim(w ->> 'title')) not between 1 and 60 then
      return false;
    end if;
  end if;

  -- items: arreglo jsonb con máximo 30 items
  if w ? 'items' then
    v_items := w -> 'items';
    if jsonb_typeof(v_items) <> 'array' then
      return false;
    end if;
    v_count := jsonb_array_length(v_items);
    if v_count > 30 then
      return false;
    end if;

    for i in 0 .. (v_count - 1) loop
      v_item := v_items -> i;
      if jsonb_typeof(v_item) <> 'object' then
        return false;
      end if;

      -- Claves de cada item
      for k in select jsonb_object_keys(v_item) loop
        if k not in ('id', 'url', 'title', 'image_url', 'price', 'notes') then
          return false;
        end if;
      end loop;

      v_id := v_item ->> 'id';
      if v_id is null or char_length(btrim(v_id)) not between 1 and 60 then
        return false;
      end if;

      v_url := v_item ->> 'url';
      if v_url is null or (v_url !~* '^https?://') or char_length(v_url) > 1000 then
        return false;
      end if;

      v_title := v_item ->> 'title';
      if v_title is null or char_length(btrim(v_title)) not between 1 and 120 then
        return false;
      end if;

      if v_item ? 'image_url' and v_item ->> 'image_url' is not null then
        v_img := v_item ->> 'image_url';
        if (v_img !~* '^https?://') or char_length(v_img) > 1000 then
          return false;
        end if;
      end if;

      if v_item ? 'price' and v_item ->> 'price' is not null then
        v_price := v_item ->> 'price';
        if char_length(btrim(v_price)) not between 1 and 30 then
          return false;
        end if;
      end if;

      if v_item ? 'notes' and v_item ->> 'notes' is not null then
        v_notes := v_item ->> 'notes';
        if char_length(btrim(v_notes)) not between 1 and 200 then
          return false;
        end if;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

alter table public.events
  add column wishlist jsonb not null default '{"enabled": false, "display_mode": "chip", "items": []}'::jsonb,
  add constraint events_wishlist_valid check (public.valid_event_wishlist(wishlist));

-- Actualizar get_event_public para incluir wishlist
drop function if exists public.get_event_public(text);

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
  theme jsonb,
  wishlist jsonb
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select e.id, e.name, e.starts_at, e.location, e.rsvp_deadline, e.access_mode,
         e.camera_unlock, e.rsvp_enabled, (e.photos_revealed_at is not null), e.enrollment_config,
         e.subtitle, e.theme, e.wishlist
  from public.events e
  where e.slug = p_slug;
$$;

grant execute on function public.get_event_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 20261026100017_frame_layer_asset.sql
-- ---------------------------------------------------------------------------
-- Marcos por capas: capa `asset` (recursos de paquetes estáticos en /packs/<pack-id>/<asset-id>)
-- y propiedad opcional `locked` para el Estudio de Diseño.
--
-- Ver src/lib/cameraAssets/layers.ts (validateLayers) y supabase/tests/frame-layers.test.ts:
-- la validación del cliente y la de PostgreSQL se mantienen 100% en paridad.

create or replace function public.valid_frame_layer(x jsonb, p_event uuid)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(x) = 'object'
    and (x ->> 'type') in ('text', 'shape', 'image', 'emoji', 'asset')
    and not exists (
      select 1 from jsonb_object_keys(x) k
      where k not in ('type', 'x', 'y', 'dx', 'dy', 'rotation', 'opacity', 'anchor', 'shadow', 'locked')
        and k not in (
          select unnest(case x ->> 'type'
            when 'text' then array['text', 'size', 'font', 'color', 'weight', 'w', 'strokeColor', 'strokeWidth']
            when 'shape' then array['shape', 'w', 'h', 'fill', 'stroke', 'strokeWidth', 'radius', 'd', 'box']
            when 'image' then array['src', 'w', 'h', 'full']
            when 'asset' then array['asset', 'w', 'h', 'tint']
            else array['emoji', 'size']
          end))
    )
    and public._frame_num(x, 'x', -1, 2)
    and public._frame_num(x, 'y', -1, 2)
    and public._frame_num(x, 'dx', -2, 2)
    and public._frame_num(x, 'dy', -2, 2)
    and public._frame_num(x, 'rotation', -360, 360)
    and public._frame_num(x, 'opacity', 0, 1)
    and (not (x ? 'anchor') or (x ->> 'anchor') in ('center', 'tl', 'tr', 'bl', 'br'))
    and (not (x ? 'locked') or jsonb_typeof(x -> 'locked') = 'boolean')
    and (not (x ? 'shadow') or public._frame_shadow(x -> 'shadow'))
    and case x ->> 'type'
      when 'text' then
        jsonb_typeof(x -> 'text') = 'string'
        and char_length(btrim(x ->> 'text')) >= 1
        and char_length(x ->> 'text') <= 60
        and public._frame_num(x, 'size', 0.005, 1)
        -- Las del sistema y las web de las capas (ver LAYER_FONTS en src/lib/cameraAssets/text.ts).
        and (not (x ? 'font') or (x ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter',
                                                    'anton', 'playfair', 'pacifico', 'marker', 'elite'))
        and public._frame_color(x, 'color')
        and (not (x ? 'weight') or (x ->> 'weight') in ('normal', 'bold'))
        and public._frame_num(x, 'w', 0.05, 4)
        and public._frame_color(x, 'strokeColor')
        and public._frame_num(x, 'strokeWidth', 0, 0.2)
      when 'shape' then
        (x ->> 'shape') in ('rect', 'ellipse', 'line', 'path')
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and public._frame_color(x, 'fill')
        and public._frame_color(x, 'stroke')
        and public._frame_num(x, 'strokeWidth', 0, 0.2)
        and public._frame_num(x, 'radius', 0, 1)
        and (not (x ? 'box') or ((x ->> 'shape') in ('rect', 'line') and public._frame_box(x -> 'box')))
        and case
          when (x ->> 'shape') = 'path' then
            jsonb_typeof(x -> 'd') = 'string'
            and char_length(x ->> 'd') between 1 and 600
            and (x ->> 'd') ~ '^[MLCZ0-9.,[:space:]-]+$'
          else not (x ? 'd')
        end
      when 'image' then
        jsonb_typeof(x -> 'src') = 'string'
        and (x ->> 'src') ~ ('^' || p_event::text || '/frames/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$')
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and (not (x ? 'full') or jsonb_typeof(x -> 'full') = 'boolean')
        and (
          (x -> 'full') = 'true'::jsonb
          or (jsonb_typeof(x -> 'w') = 'number' and jsonb_typeof(x -> 'h') = 'number')
        )
      when 'asset' then
        jsonb_typeof(x -> 'asset') = 'string'
        and (x ->> 'asset') ~ '^pack:[a-z0-9][a-z0-9-]{0,49}/[a-z0-9][a-z0-9-]{0,49}$'
        and jsonb_typeof(x -> 'w') = 'number'
        and jsonb_typeof(x -> 'h') = 'number'
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and public._frame_color(x, 'tint')
      else
        jsonb_typeof(x -> 'emoji') = 'string'
        and char_length(x ->> 'emoji') between 1 and 32
        and public._frame_num(x, 'size', 0.01, 1)
    end,
    false);
$$;

-- ---------------------------------------------------------------------------
-- 20261026100018_frames_solo_capas.sql
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Marcos: solo existe la plantilla 'capas'.
--
-- Las plantillas paramétricas antiguas (border, polaroid, film, viewfinder,
-- banner, glow) se retiran de la app. Se borran los marcos que las usaban:
-- los diseños de eventos reales viven como SQL de carga (docs/clientes/…) y se
-- pueden volver a crear. events.default_frame_id queda en null por su FK.
-- ---------------------------------------------------------------------------
delete from public.event_frames where template <> 'capas';

alter table public.event_frames drop constraint event_frames_template_check;
alter table public.event_frames
  add constraint event_frames_template_check
  check (template = 'capas');

-- Redundante: con una sola plantilla, las capas siempre valen.
alter table public.event_frames drop constraint event_frames_layers_only_capas;

-- ---------------------------------------------------------------------------
-- Un evento nuevo arranca con un marco de capas (el nombre del evento al pie,
-- igual que defaultFrameParams('capas') en el cliente) y unos emojis de ejemplo.
-- ---------------------------------------------------------------------------
create or replace function public.seed_event_camera()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_title text := left(btrim(new.name), 60);
begin
  insert into public.event_frames (event_id, template, label, params, sort_order) values
    (new.id, 'capas', 'Título',
     jsonb_build_object('layers',
       case when v_title = '' then '[]'::jsonb
       else jsonb_build_array(jsonb_build_object(
         'type', 'text', 'text', v_title, 'x', 0.5, 'y', 0.92, 'size', 0.08, 'w', 1.6,
         'font', 'display', 'color', '#ffffff', 'weight', 'bold'))
       end), 0);

  insert into public.event_stickers (event_id, kind, emoji, sort_order) values
    (new.id, 'emoji', U&'\+01F389', 0),
    (new.id, 'emoji', U&'\+01F382', 1),
    (new.id, 'emoji', U&'\+002764\+00FE0F', 2),
    (new.id, 'emoji', U&'\+01F4F8', 3),
    (new.id, 'emoji', U&'\+01F973', 4),
    (new.id, 'emoji', U&'\+002728', 5);

  return new;
end;
$$;

revoke execute on function public.seed_event_camera() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 20261027100019_frame_variants.sql
-- ---------------------------------------------------------------------------
-- Variantes por proporción para los marcos de capas (`params.variants`).
--
-- Un marco puede guardar un diseño independiente para cada proporción del
-- lienzo ('3:4', '4:3', '1:1' y '9:16'). Cada variante lleva su propia lista
-- `layers` con el mismo tope de 40 capas y 32 KB que antes. `params.layers` se
-- conserva como espejo de '3:4' por compatibilidad con la cámara.
--
-- Topes de tamaño:
--   * El cliente limita `params` con `variants` a 65536 caracteres del JSON
--     compacto (`MAX_VARIANTS_PARAMS_LENGTH`) y cada variante (y `layers`) a
--     16384 caracteres (`MAX_LAYERS_PARAMS_LENGTH`).
--   * Aquí se mide `octet_length(jsonb::text)`, que formatea con espacios y
--     cuenta bytes UTF-8, por lo que el tope total sube a 128 KB (131072 bytes)
--     y el de cada variante o `layers` se mantiene en 32 KB (32768 bytes). Así
--     el cliente rechaza SIEMPRE antes que la base.
--
-- Ver `src/lib/cameraAssets/frames.ts` (`validateFrameParams`) y
-- `supabase/tests/frame-variants.test.ts`.

-- ---------------------------------------------------------------------------
-- (a) Validación de `params.variants`: objeto opcional donde cada clave es una
-- proporción conocida y cada valor es `{"layers": [...]}` dentro de 32 KB.
-- ---------------------------------------------------------------------------
create or replace function public.valid_frame_variants(v jsonb, p_event uuid)
returns boolean
language sql
immutable
as $$
  select case
    when v is null then true
    when jsonb_typeof(v) <> 'object' then false
    else not exists (
      select 1
      from jsonb_each(v) as e(k, val)
      where e.k not in ('3:4', '4:3', '1:1', '9:16')
         or case
              when jsonb_typeof(e.val) <> 'object' then true
              else exists (select 1 from jsonb_object_keys(e.val) vk where vk <> 'layers')
                or not (e.val ? 'layers')
                or jsonb_typeof(e.val -> 'layers') <> 'array'
                or octet_length(e.val::text) > 32768
                or not public.valid_frame_layers(e.val -> 'layers', p_event)
            end
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- (b) `valid_frame_params`: admite `variants` y sube el tope total a 128 KB
-- cuando está presente; si conviven `variants` y `layers`, `layers` conserva su
-- propio tope de 32 KB.
-- ---------------------------------------------------------------------------
create or replace function public.valid_frame_params(p jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= case when p ? 'variants' then 131072 when p ? 'layers' then 32768 else 2048 end
    and not exists (
      select 1 from jsonb_object_keys(p) k
      where k not in ('primaryColor', 'secondaryColor', 'textColor', 'title', 'subtitle',
                      'caption', 'font', 'thickness', 'radius', 'position', 'layers', 'variants')
    )
    and (not (p ? 'primaryColor')
         or (jsonb_typeof(p -> 'primaryColor') = 'string' and (p ->> 'primaryColor') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (p ? 'secondaryColor')
         or (jsonb_typeof(p -> 'secondaryColor') = 'string' and (p ->> 'secondaryColor') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (p ? 'textColor')
         or (jsonb_typeof(p -> 'textColor') = 'string' and (p ->> 'textColor') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (p ? 'title')
         or (jsonb_typeof(p -> 'title') = 'string' and char_length(p ->> 'title') <= 60))
    and (not (p ? 'subtitle')
         or (jsonb_typeof(p -> 'subtitle') = 'string' and char_length(p ->> 'subtitle') <= 60))
    and (not (p ? 'caption')
         or (jsonb_typeof(p -> 'caption') = 'string' and char_length(p ->> 'caption') <= 60))
    and (not (p ? 'font')
         or (jsonb_typeof(p -> 'font') = 'string'
             and (p ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter')))
    and (not (p ? 'thickness')
         or (jsonb_typeof(p -> 'thickness') = 'number' and (p ->> 'thickness')::numeric between 0 and 1))
    and (not (p ? 'radius')
         or (jsonb_typeof(p -> 'radius') = 'number' and (p ->> 'radius')::numeric between 0 and 1))
    and (not (p ? 'position')
         or (jsonb_typeof(p -> 'position') = 'string' and (p ->> 'position') in ('top', 'bottom')))
    and (not (p ? 'layers')
         or (jsonb_typeof(p -> 'layers') = 'array'
             and (not (p ? 'variants') or octet_length((p -> 'layers')::text) <= 32768)))
    and (not (p ? 'variants') or jsonb_typeof(p -> 'variants') = 'object');
$$;

-- ---------------------------------------------------------------------------
-- (c) Restricción de fila: valida tanto `layers` como `variants` con el
-- `event_id` dueño del marco.
-- ---------------------------------------------------------------------------
alter table public.event_frames drop constraint if exists event_frames_layers_valid;
alter table public.event_frames
  add constraint event_frames_layers_valid
  check (
    public.valid_frame_layers(params -> 'layers', event_id)
    and public.valid_frame_variants(params -> 'variants', event_id)
  );

-- ---------------------------------------------------------------------------
-- Storage: un invitado puede leer la imagen de una capa de un marco activo si
-- aparece en `params -> 'layers'` (marcos antiguos o espejo de 3:4) O en
-- alguna variante (`params -> 'variants' -> <proporción> -> 'layers'`), ya que
-- una imagen puede existir solo en una proporción distinta de 3:4.
-- Aunque la restricción de la tabla exige que `variants` sea objeto y cada
-- `layers` sea lista, se protege `jsonb_each` y `jsonb_array_elements` con
-- `case when jsonb_typeof(...)` porque fallan si reciben otro tipo JSON.
-- ---------------------------------------------------------------------------
create or replace function public.event_asset_is_public(p_path text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1
    from public.event_stickers s
    join public.events e on e.id = s.event_id
    where s.storage_path = p_path and s.enabled and e.stickers_enabled
  ) or exists (
    select 1
    from public.event_frames f
    join public.events e on e.id = f.event_id
    where f.enabled and e.frames_enabled and f.template = 'capas'
      and p_path like f.event_id::text || '/frames/%'
      and (
        exists (
          select 1 from jsonb_array_elements(coalesce(f.params -> 'layers', '[]'::jsonb)) l
          where l ->> 'type' = 'image' and l ->> 'src' = p_path
        )
        or exists (
          select 1
          from jsonb_each(
            case when jsonb_typeof(f.params -> 'variants') = 'object' then f.params -> 'variants' else '{}'::jsonb end
          ) v(k, val),
          jsonb_array_elements(
            case when jsonb_typeof(val -> 'layers') = 'array' then val -> 'layers' else '[]'::jsonb end
          ) l
          where l ->> 'type' = 'image' and l ->> 'src' = p_path
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- (d) Backfill: los marcos anteriores (solo `layers`, sin `variants`) reciben
-- las cuatro proporciones con las mismas capas, conservando `layers`, siempre
-- que el resultado no supere los 64 KB (65536 bytes) para seguir siendo válido
-- en el cliente.
-- ---------------------------------------------------------------------------
update public.event_frames
set params = params || jsonb_build_object(
  'variants',
  jsonb_build_object(
    '3:4', jsonb_build_object('layers', params -> 'layers'),
    '4:3', jsonb_build_object('layers', params -> 'layers'),
    '1:1', jsonb_build_object('layers', params -> 'layers'),
    '9:16', jsonb_build_object('layers', params -> 'layers')
  )
)
where template = 'capas'
  and params ? 'layers'
  and jsonb_typeof(params -> 'layers') = 'array'
  and not (params ? 'variants')
  and octet_length(
    (
      params || jsonb_build_object(
        'variants',
        jsonb_build_object(
          '3:4', jsonb_build_object('layers', params -> 'layers'),
          '4:3', jsonb_build_object('layers', params -> 'layers'),
          '1:1', jsonb_build_object('layers', params -> 'layers'),
          '9:16', jsonb_build_object('layers', params -> 'layers')
        )
      )
    )::text
  ) <= 65536;

-- ---------------------------------------------------------------------------
-- 20261028100020_camera_closes_at.sql
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Hora limite de la camara: events.camera_closes_at.
--
-- null = sin limite (como hasta ahora). Pasada esa hora, la base rechaza las fotos NUEVAS:
--   * submit_photo responde 55000 (el cliente lo muestra como «la camara ya cerro»). Un reintento de una ruta
--     ya registrada sigue devolviendo su fila: no se pierde una foto cuya respuesta se extravio.
--   * la politica de subida a Storage tambien lo exige, para que no queden archivos huerfanos.
-- get_event_public entrega la hora para que la interfaz del invitado lo muestre (cambia el tipo de retorno).
-- La organizadora puede cerrar «ahora» poniendo la hora actual, o reabrir borrandola o moviendola al futuro.
-- ---------------------------------------------------------------------------
alter table public.events add column camera_closes_at timestamptz;

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
  theme jsonb,
  wishlist jsonb,
  camera_closes_at timestamptz
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select e.id, e.name, e.starts_at, e.location, e.rsvp_deadline, e.access_mode,
         e.camera_unlock, e.rsvp_enabled, (e.photos_revealed_at is not null), e.enrollment_config,
         e.subtitle, e.theme, e.wishlist, e.camera_closes_at
  from public.events e
  where e.slug = p_slug;
$$;

grant execute on function public.get_event_public(text) to anon, authenticated;

-- Subida del invitado a su carpeta: ademas de existir y estar aprobado, el evento no debe haber cerrado la camara.
create or replace function public.guest_folder_exists(p_event text, p_guest text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1
    from public.guests g
    join public.events e on e.id = g.event_id
    where g.event_id = public.safe_uuid(p_event)
      and g.id = public.safe_uuid(p_guest)
      and g.approval_status = 'approved'
      and (e.camera_closes_at is null or now() < e.camera_closes_at)
  );
$$;

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
  v_camera_closes_at timestamptz;
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

  select e.camera_unlock, e.camera_closes_at into v_camera_unlock, v_camera_closes_at
  from public.events e where e.id = v_guest.event_id;
  if v_camera_unlock = 'on_checkin' and v_guest.checked_in_at is null then
    raise exception 'check-in required before taking photos' using errcode = '42501';
  end if;
  if v_camera_unlock = 'on_event_qr' and v_guest.camera_activated_at is null then
    raise exception 'camera activation (event QR) required before taking photos' using errcode = '42501';
  end if;

  -- Reintento: la ruta ya esta registrada (el prefijo garantiza que es de este invitado).
  select * into v_photo from public.photos p where p.storage_path = p_storage_path;
  if not found then
    -- Hora limite del evento: pasada, no entran fotos NUEVAS. Va aqui y no antes del reintento para que una
    -- foto ya registrada cuya respuesta se perdio siga devolviendo su fila.
    if v_camera_closes_at is not null and now() >= v_camera_closes_at then
      raise exception 'the event camera is closed' using errcode = '55000';
    end if;

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

-- ---------------------------------------------------------------------------
-- 20261101100021_frame_fonts_formales.sql
-- ---------------------------------------------------------------------------
-- Tres tipografías formales para las capas de texto: Cinzel, Great Vibes y Cormorant Garamond.
-- Solo amplía la lista de fuentes válidas de `valid_frame_layer`; el resto de la función queda igual
-- que en 20261026100017_frame_layer_asset.sql.
--
-- Ver LAYER_FONTS en src/lib/cameraAssets/text.ts y supabase/tests/frame-layers.test.ts:
-- la validación del cliente y la de PostgreSQL se mantienen 100% en paridad.

create or replace function public.valid_frame_layer(x jsonb, p_event uuid)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(x) = 'object'
    and (x ->> 'type') in ('text', 'shape', 'image', 'emoji', 'asset')
    and not exists (
      select 1 from jsonb_object_keys(x) k
      where k not in ('type', 'x', 'y', 'dx', 'dy', 'rotation', 'opacity', 'anchor', 'shadow', 'locked')
        and k not in (
          select unnest(case x ->> 'type'
            when 'text' then array['text', 'size', 'font', 'color', 'weight', 'w', 'strokeColor', 'strokeWidth']
            when 'shape' then array['shape', 'w', 'h', 'fill', 'stroke', 'strokeWidth', 'radius', 'd', 'box']
            when 'image' then array['src', 'w', 'h', 'full']
            when 'asset' then array['asset', 'w', 'h', 'tint']
            else array['emoji', 'size']
          end))
    )
    and public._frame_num(x, 'x', -1, 2)
    and public._frame_num(x, 'y', -1, 2)
    and public._frame_num(x, 'dx', -2, 2)
    and public._frame_num(x, 'dy', -2, 2)
    and public._frame_num(x, 'rotation', -360, 360)
    and public._frame_num(x, 'opacity', 0, 1)
    and (not (x ? 'anchor') or (x ->> 'anchor') in ('center', 'tl', 'tr', 'bl', 'br'))
    and (not (x ? 'locked') or jsonb_typeof(x -> 'locked') = 'boolean')
    and (not (x ? 'shadow') or public._frame_shadow(x -> 'shadow'))
    and case x ->> 'type'
      when 'text' then
        jsonb_typeof(x -> 'text') = 'string'
        and char_length(btrim(x ->> 'text')) >= 1
        and char_length(x ->> 'text') <= 60
        and public._frame_num(x, 'size', 0.005, 1)
        -- Las del sistema y las web de las capas (ver LAYER_FONTS en src/lib/cameraAssets/text.ts).
        and (not (x ? 'font') or (x ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter',
                                                    'anton', 'playfair', 'pacifico', 'marker', 'elite',
                                                    'cinzel', 'vibes', 'cormorant'))
        and public._frame_color(x, 'color')
        and (not (x ? 'weight') or (x ->> 'weight') in ('normal', 'bold'))
        and public._frame_num(x, 'w', 0.05, 4)
        and public._frame_color(x, 'strokeColor')
        and public._frame_num(x, 'strokeWidth', 0, 0.2)
      when 'shape' then
        (x ->> 'shape') in ('rect', 'ellipse', 'line', 'path')
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and public._frame_color(x, 'fill')
        and public._frame_color(x, 'stroke')
        and public._frame_num(x, 'strokeWidth', 0, 0.2)
        and public._frame_num(x, 'radius', 0, 1)
        and (not (x ? 'box') or ((x ->> 'shape') in ('rect', 'line') and public._frame_box(x -> 'box')))
        and case
          when (x ->> 'shape') = 'path' then
            jsonb_typeof(x -> 'd') = 'string'
            and char_length(x ->> 'd') between 1 and 600
            and (x ->> 'd') ~ '^[MLCZ0-9.,[:space:]-]+$'
          else not (x ? 'd')
        end
      when 'image' then
        jsonb_typeof(x -> 'src') = 'string'
        and (x ->> 'src') ~ ('^' || p_event::text || '/frames/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$')
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and (not (x ? 'full') or jsonb_typeof(x -> 'full') = 'boolean')
        and (
          (x -> 'full') = 'true'::jsonb
          or (jsonb_typeof(x -> 'w') = 'number' and jsonb_typeof(x -> 'h') = 'number')
        )
      when 'asset' then
        jsonb_typeof(x -> 'asset') = 'string'
        and (x ->> 'asset') ~ '^pack:[a-z0-9][a-z0-9-]{0,49}/[a-z0-9][a-z0-9-]{0,49}$'
        and jsonb_typeof(x -> 'w') = 'number'
        and jsonb_typeof(x -> 'h') = 'number'
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and public._frame_color(x, 'tint')
      else
        jsonb_typeof(x -> 'emoji') = 'string'
        and char_length(x ->> 'emoji') between 1 and 32
        and public._frame_num(x, 'size', 0.01, 1)
    end,
    false);
$$;

-- ===========================================================================
-- 3 / 3  REGISTRO EN EL HISTORIAL DE MIGRACIONES
-- ===========================================================================
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version)
    values ('20261015100001'), ('20261015100002'), ('20261015100003'), ('20261015100004'), ('20261015100005'), ('20261015100006'), ('20261015100007'), ('20261015100008'), ('20261015100009'), ('20261018100010'), ('20261018100011'), ('20261023100012'), ('20261024100013'), ('20261024100014'), ('20261024100015'), ('20261025100016'), ('20261025100017'), ('20261026100017'), ('20261026100018'), ('20261027100019'), ('20261028100020'), ('20261101100021')
    on conflict (version) do nothing;
  end if;
end
$$;

commit;
