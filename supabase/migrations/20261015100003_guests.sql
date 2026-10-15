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
