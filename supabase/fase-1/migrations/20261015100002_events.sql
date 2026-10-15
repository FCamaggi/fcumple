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
  -- Como entran los invitados (ver docs/fase-1-mvp-multitenant/acceso-de-invitados.md):
  --   list           solo quien esta en la lista
  --   list_requests  lista + solicitudes que el organizador aprueba
  --   open           cualquiera con el enlace, escribiendo nombre y apellido
  access_mode text not null default 'list'
    check (access_mode in ('list', 'list_requests', 'open')),
  -- name        el invitado escribe nombre y apellido (identify_guest)
  -- rut_lookup  un servicio externo resuelve RUT -> nombre; el RUT jamas se
  --             guarda (identify_guest_verified, solo service_role)
  identifier text not null default 'name'
    check (identifier in ('name', 'rut_lookup')),
  -- on_identify: la camara se habilita al identificarse.
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
set search_path = public
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
