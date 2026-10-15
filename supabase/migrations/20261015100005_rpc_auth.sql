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
