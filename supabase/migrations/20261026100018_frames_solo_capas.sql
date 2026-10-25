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
