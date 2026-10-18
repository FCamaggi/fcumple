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
        and (not (x ? 'font') or (x ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter'))
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
