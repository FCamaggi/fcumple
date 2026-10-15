-- Identificacion de invitados con UN enlace por evento.
--
-- El invitado escribe su nombre y apellido (o, en eventos con
-- identifier = 'rut_lookup', un servicio externo resuelve RUT -> nombre en el
-- servidor). En ningun caso se guarda un RUT: esta capa solo ve nombres.

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

-- Nucleo compartido. NO es invocable por anon/authenticated: lo llaman las
-- dos funciones publicas de abajo.
--
-- p_verified = false: el nombre lo escribio el invitado. Se acepta si las
--   palabras que escribio estan contenidas en las del invitado de la lista
--   ("Juan Perez" encuentra a "Juan Carlos Perez Gonzalez").
-- p_verified = true: el nombre viene de un servicio de identidad (nombre
--   legal completo). Se acepta si las palabras del invitado de la lista estan
--   contenidas en el nombre legal (el sentido inverso).
create or replace function public._identify_core(
  p_event_id uuid,
  p_name text,
  p_verified boolean
)
returns table (
  outcome text,        -- ok | pending_approval | not_found | ambiguous
  guest_token text,    -- solo cuando outcome = 'ok'
  guest_id uuid,
  guest_name text
)
language plpgsql
security definer
set search_path = public
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
  select * into v_event from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  v_tokens := public.name_tokens(p_name);
  if cardinality(v_tokens) < 2 then
    raise exception 'name must include first name and last name' using errcode = '22023';
  end if;
  v_clean := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));

  -- Freno de intentos (solo para nombres escritos por el invitado; el camino
  -- verificado lo limita el propio servicio de identidad).
  if not p_verified then
    delete from public.identify_attempts a where a.attempted_at < now() - interval '1 hour';

    if (select count(*) from public.identify_attempts a
         where a.event_id = v_event.id and a.client_key = v_key
           and a.attempted_at > now() - interval '10 minutes') >= 10
       or (select count(*) from public.identify_attempts a
            where a.event_id = v_event.id
              and a.attempted_at > now() - interval '10 minutes') >= 60
    then
      raise exception 'too many attempts, try again later' using errcode = '53400';
    end if;
  end if;

  -- ---- Modo abierto: coincidencia exacta o alta nueva ------------------
  if v_event.access_mode = 'open' then
    select * into v_guest from public.guests g
     where g.event_id = v_event.id and g.name_tokens = v_tokens;

    if found then
      if v_guest.approval_status <> 'approved' then
        if not p_verified then
          insert into public.identify_attempts (event_id, client_key) values (v_event.id, v_key);
        end if;
        return query select 'not_found'::text, null::text, null::uuid, null::text;
        return;
      end if;
    else
      -- Cada alta cuenta como intento: frena el spam de invitados falsos.
      if not p_verified then
        insert into public.identify_attempts (event_id, client_key) values (v_event.id, v_key);
      end if;
      begin
        insert into public.guests (event_id, full_name)
        values (v_event.id, v_clean)
        returning * into v_guest;
      exception when unique_violation then
        select * into v_guest from public.guests g
         where g.event_id = v_event.id and g.name_tokens = v_tokens;
      end;
    end if;

    update public.guests g
       set claimed_at = coalesce(g.claimed_at, now()), last_seen_at = now()
     where g.id = v_guest.id
    returning * into v_guest;

    return query select 'ok'::text, v_guest.token, v_guest.id, v_guest.full_name;
    return;
  end if;

  -- ---- Modos con lista -------------------------------------------------
  v_ids := array(
    select g.id from public.guests g
     where g.event_id = v_event.id
       and g.approval_status <> 'rejected'
       and case when p_verified then g.name_tokens <@ v_tokens
                else g.name_tokens @> v_tokens end
  );

  if cardinality(v_ids) > 1 then
    if not p_verified then
      insert into public.identify_attempts (event_id, client_key) values (v_event.id, v_key);
    end if;
    return query select 'ambiguous'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if cardinality(v_ids) = 1 then
    select * into v_guest from public.guests g where g.id = v_ids[1];

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

  -- Nadie coincide.
  if not p_verified then
    insert into public.identify_attempts (event_id, client_key) values (v_event.id, v_key);
  end if;

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
      return query select 'not_found'::text, null::text, null::uuid, null::text;
      return;
    end;

    return query select 'pending_approval'::text, null::text, v_guest.id, v_guest.full_name;
    return;
  end if;

  return query select 'not_found'::text, null::text, null::uuid, null::text;
end;
$$;

revoke execute on function public._identify_core(uuid, text, boolean) from public, anon, authenticated;

-- Camino publico: el invitado escribe su nombre.
create or replace function public.identify_guest(p_slug text, p_name text)
returns table (
  outcome text,
  guest_token text,
  guest_id uuid,
  guest_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  select * into v_event from public.events e where e.slug = p_slug;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_event.identifier <> 'name' then
    raise exception 'this event identifies guests by RUT lookup' using errcode = '42501';
  end if;

  return query select * from public._identify_core(v_event.id, p_name, false);
end;
$$;

grant execute on function public.identify_guest(text, text) to anon, authenticated;

-- Camino verificado: SOLO service_role (la funcion serverless que consulta el
-- servicio de identidad). Recibe el nombre ya resuelto, nunca el RUT.
create or replace function public.identify_guest_verified(p_event_id uuid, p_verified_name text)
returns table (
  outcome text,
  guest_token text,
  guest_id uuid,
  guest_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identifier text;
begin
  select e.identifier into v_identifier from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_identifier <> 'rut_lookup' then
    raise exception 'this event does not use RUT lookup' using errcode = '42501';
  end if;

  return query select * from public._identify_core(p_event_id, p_verified_name, true);
end;
$$;

revoke execute on function public.identify_guest_verified(uuid, text) from public, anon, authenticated;
grant execute on function public.identify_guest_verified(uuid, text) to service_role;
