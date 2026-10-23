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
