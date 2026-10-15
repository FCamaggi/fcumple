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
