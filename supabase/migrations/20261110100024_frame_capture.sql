-- Escala del capturador: la imagen de borde a borde (`full: true`) puede llevar `capture`, la ventana
-- transparente de la foto normalizada al lienzo y cuánto la desborda la foto:
--   {"x": 0..1, "y": 0..1, "w": 0.02..1, "h": 0.02..1, "scale": 1..10}, con x + w <= 1 e y + h <= 1.
-- Es un campo opcional nuevo: los marcos guardados siguen valiendo y se dibujan igual que antes.
-- `valid_frame_layer` queda igual que en 20261102100022_frame_fonts_propias.sql salvo la clave nueva.
--
-- Ver src/lib/cameraAssets/capture.ts y la regla espejo `isCaptureWindow` en src/lib/cameraAssets/layers.ts;
-- supabase/tests/frame-layers.test.ts prueba la paridad.

create or replace function public._frame_capture(c jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(c) = 'object'
    and (select count(*) from jsonb_object_keys(c)) = 5
    and c ?& array['x', 'y', 'w', 'h', 'scale']
    and public._frame_num(c, 'x', 0, 1)
    and public._frame_num(c, 'y', 0, 1)
    and public._frame_num(c, 'w', 0.02, 1)
    and public._frame_num(c, 'h', 0.02, 1)
    and public._frame_num(c, 'scale', 1, 10)
    -- `case`: la suma solo se evalúa con los cuatro números ya comprobados (un `and` no garantiza orden).
    and case
      when jsonb_typeof(c -> 'x') = 'number' and jsonb_typeof(c -> 'w') = 'number'
       and jsonb_typeof(c -> 'y') = 'number' and jsonb_typeof(c -> 'h') = 'number'
      then (c ->> 'x')::numeric + (c ->> 'w')::numeric <= 1.0001
       and (c ->> 'y')::numeric + (c ->> 'h')::numeric <= 1.0001
      else false
    end,
    false);
$$;

create or replace function public.valid_frame_layer(x jsonb, p_event uuid)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(x) = 'object'
    and (x ->> 'type') in ('text', 'shape', 'image', 'emoji', 'asset')
    and not exists (
      select 1 from jsonb_object_keys(x) k
      where k not in ('type', 'x', 'y', 'dx', 'dy', 'rotation', 'opacity', 'anchor', 'shadow', 'locked')
        and k not in (
          select unnest(case x ->> 'type'
            when 'text' then array['text', 'size', 'font', 'color', 'weight', 'w', 'strokeColor', 'strokeWidth']
            when 'shape' then array['shape', 'w', 'h', 'fill', 'stroke', 'strokeWidth', 'radius', 'd', 'box']
            when 'image' then array['src', 'w', 'h', 'full', 'capture']
            when 'asset' then array['asset', 'w', 'h', 'tint']
            else array['emoji', 'size']
          end))
    )
    and public._frame_num(x, 'x', -1, 2)
    and public._frame_num(x, 'y', -1, 2)
    and public._frame_num(x, 'dx', -2, 2)
    and public._frame_num(x, 'dy', -2, 2)
    and public._frame_num(x, 'rotation', -360, 360)
    and public._frame_num(x, 'opacity', 0, 1)
    and (not (x ? 'anchor') or (x ->> 'anchor') in ('center', 'tl', 'tr', 'bl', 'br'))
    and (not (x ? 'locked') or jsonb_typeof(x -> 'locked') = 'boolean')
    and (not (x ? 'shadow') or public._frame_shadow(x -> 'shadow'))
    and case x ->> 'type'
      when 'text' then
        jsonb_typeof(x -> 'text') = 'string'
        and char_length(btrim(x ->> 'text')) >= 1
        and char_length(x ->> 'text') <= 60
        and public._frame_num(x, 'size', 0.005, 1)
        -- Las del sistema y las web de las capas (ver LAYER_FONTS en src/lib/cameraAssets/text.ts).
        and (not (x ? 'font') or (x ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter',
                                                    'anton', 'playfair', 'pacifico', 'marker', 'elite',
                                                    'cinzel', 'vibes', 'cormorant',
                                                    'gala-caligrafia', 'gala-romana', 'gala-deco'))
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
        and (not (x ? 'box') or ((x ->> 'shape') in ('rect', 'line') and public._frame_box(x -> 'box')))
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
        and (not (x ? 'capture') or ((x -> 'full') = 'true'::jsonb and public._frame_capture(x -> 'capture')))
      when 'asset' then
        jsonb_typeof(x -> 'asset') = 'string'
        and (x ->> 'asset') ~ '^pack:[a-z0-9][a-z0-9-]{0,49}/[a-z0-9][a-z0-9-]{0,49}$'
        and jsonb_typeof(x -> 'w') = 'number'
        and jsonb_typeof(x -> 'h') = 'number'
        and public._frame_num(x, 'w', 0, 4)
        and public._frame_num(x, 'h', 0, 4)
        and public._frame_color(x, 'tint')
      else
        jsonb_typeof(x -> 'emoji') = 'string'
        and char_length(x ->> 'emoji') between 1 and 32
        and public._frame_num(x, 'size', 0.01, 1)
    end,
    false);
$$;
