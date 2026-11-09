-- Varios duenos por evento (S1, S3).
--
-- Un evento puede tener hasta 10 cuentas organizadoras con los mismos permisos
-- (RLS de todas las tablas del evento, Storage y RPC de organizador).
-- events.owner_id se conserva como el creador del evento (inmutable, cuenta
-- para el tope de 10 eventos creados por cuenta en create_event).

-- ---------------------------------------------------------------------------
-- Tabla de duenos por evento y relleno de eventos existentes
-- ---------------------------------------------------------------------------
create table public.event_owners (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_owners_user_idx on public.event_owners (user_id);

alter table public.event_owners enable row level security;
revoke all on public.event_owners from public, anon, authenticated;

insert into public.event_owners (event_id, user_id, created_at)
select e.id, e.owner_id, e.created_at
  from public.events e
on conflict (event_id, user_id) do nothing;

-- Todo evento nuevo registra automaticamente a su creador en event_owners.
create or replace function public.add_creator_as_event_owner()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.event_owners (event_id, user_id)
  values (new.id, new.owner_id)
  on conflict (event_id, user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.add_creator_as_event_owner() from public, anon, authenticated;

create trigger events_add_creator_owner
  after insert on public.events
  for each row execute function public.add_creator_as_event_owner();

-- El creador (events.owner_id) no se puede cambiar una vez creado el evento.
create or replace function public.prevent_event_owner_id_change()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_prevent_owner_id_change
  before update on public.events
  for each row execute function public.prevent_event_owner_id_change();

-- ---------------------------------------------------------------------------
-- Puente de permisos y politicas de events
-- ---------------------------------------------------------------------------
create or replace function public.is_event_owner(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1 from public.event_owners eo
    where eo.event_id = p_event_id and eo.user_id = auth.uid()
  );
$$;

drop policy "owner_all" on public.events;

-- El RETURNING de un insert directo en events se evalua antes del trigger
-- AFTER INSERT, por eso select contempla tambien owner_id = auth.uid().
create policy "owner_select" on public.events
  for select
  to authenticated
  using (owner_id = auth.uid() or public.is_event_owner(id));

create policy "owner_insert" on public.events
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "owner_update" on public.events
  for update
  to authenticated
  using (public.is_event_owner(id))
  with check (public.is_event_owner(id));

create policy "owner_delete" on public.events
  for delete
  to authenticated
  using (public.is_event_owner(id));

-- ---------------------------------------------------------------------------
-- Invitaciones de un solo uso para sumar co-duenos (solo se guarda el hash)
-- ---------------------------------------------------------------------------
create table public.event_owner_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

create index event_owner_invites_event_idx on public.event_owner_invites (event_id);

alter table public.event_owner_invites enable row level security;
revoke all on public.event_owner_invites from public, anon, authenticated;

create or replace function public.create_owner_invite(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_hash text;
begin
  if auth.uid() is null or not public.is_event_owner(p_event_id) then
    raise exception 'only an event owner can create invites' using errcode = '42501';
  end if;

  if (select count(*) from public.event_owners eo where eo.event_id = p_event_id) >= 10 then
    raise exception 'owner limit reached' using errcode = '53400';
  end if;

  if (select count(*) from public.event_owner_invites i
       where i.event_id = p_event_id
         and i.used_at is null
         and i.expires_at > now()) >= 5 then
    raise exception 'invite limit reached' using errcode = '53400';
  end if;

  -- 24 bytes en base64 URL-safe = 32 caracteres exactos sin relleno.
  v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into public.event_owner_invites (event_id, token_hash, created_by)
  values (p_event_id, v_hash, auth.uid());

  return v_token;
end;
$$;

revoke execute on function public.create_owner_invite(uuid) from public, anon;
grant execute on function public.create_owner_invite(uuid) to authenticated;

create or replace function public.accept_owner_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_invite public.event_owner_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  v_hash := encode(digest(btrim(p_token), 'sha256'), 'hex');

  select * into v_invite
    from public.event_owner_invites i
   where i.token_hash = v_hash
     and i.used_at is null
     and i.expires_at > now()
     for update;

  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  -- Si quien acepta ya es dueno, devuelve el event_id sin gastar la invitacion.
  if public.is_event_owner(v_invite.event_id) then
    return v_invite.event_id;
  end if;

  if (select count(*) from public.event_owners eo where eo.event_id = v_invite.event_id) >= 10 then
    raise exception 'owner limit reached' using errcode = '53400';
  end if;

  insert into public.event_owners (event_id, user_id)
  values (v_invite.event_id, auth.uid());

  update public.event_owner_invites i
     set used_at = now(),
         used_by = auth.uid()
   where i.id = v_invite.id;

  return v_invite.event_id;
end;
$$;

revoke execute on function public.accept_owner_invite(text) from public, anon;
grant execute on function public.accept_owner_invite(text) to authenticated;

create or replace function public.list_event_owners(p_event_id uuid)
returns table (
  user_id uuid,
  email text,
  is_creator boolean,
  is_me boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
begin
  if auth.uid() is null or not public.is_event_owner(p_event_id) then
    raise exception 'only an event owner can list owners' using errcode = '42501';
  end if;

  return query
  select eo.user_id,
         coalesce(u.email, '')::text as email,
         (e.owner_id = eo.user_id) as is_creator,
         (eo.user_id = auth.uid()) as is_me,
         eo.created_at
    from public.event_owners eo
    join public.events e on e.id = eo.event_id
    join auth.users u on u.id = eo.user_id
   where eo.event_id = p_event_id
   order by eo.created_at, eo.user_id;
end;
$$;

revoke execute on function public.list_event_owners(uuid) from public, anon;
grant execute on function public.list_event_owners(uuid) to authenticated;
