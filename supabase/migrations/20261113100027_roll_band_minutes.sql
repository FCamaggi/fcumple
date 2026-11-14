-- ---------------------------------------------------------------------------
-- Intervalo del rollo revelado: events.roll_band_minutes.
--
-- El rollo agrupa las fotos publicadas en bandas alineadas al reloj de Chile. Antes eran siempre de 1 hora; ahora
-- la organizadora elige el intervalo. 60 por defecto, asi los eventos existentes no cambian. Solo valores que
-- dividen el dia exacto (las bandas se cuentan desde la medianoche); debe coincidir con ROLL_BAND_MINUTES de
-- src/lib/photoTimeline.ts.
-- get_event_public lo entrega al invitado (cambia el tipo de retorno, por eso se borra y se vuelve a crear).
-- ---------------------------------------------------------------------------
alter table public.events
  add column roll_band_minutes int not null default 60,
  add constraint events_roll_band_minutes_check check (roll_band_minutes in (15, 30, 60, 90, 120, 180));

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
  camera_closes_at timestamptz,
  roll_band_minutes int
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select e.id, e.name, e.starts_at, e.location, e.rsvp_deadline, e.access_mode,
         e.camera_unlock, e.rsvp_enabled, (e.photos_revealed_at is not null), e.enrollment_config,
         e.subtitle, e.theme, e.wishlist, e.camera_closes_at, e.roll_band_minutes
  from public.events e
  where e.slug = p_slug;
$$;

grant execute on function public.get_event_public(text) to anon, authenticated;
