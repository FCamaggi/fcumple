-- Tres fuentes propias para las capas de texto, dibujadas por IA sobre la plantilla de scripts/fuentes/
-- y servidas desde public/fonts/<id>.woff2: gala-caligrafia, gala-romana y gala-deco.
-- Solo amplía la lista de fuentes válidas de `valid_frame_layer`; el resto de la función queda igual
-- que en 20261101100021_frame_fonts_formales.sql.
--
-- Ver LAYER_FONTS en src/lib/cameraAssets/text.ts y supabase/tests/frame-layers.test.ts:
-- la validación del cliente y la de PostgreSQL se mantienen 100% en paridad.

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
            when 'image' then array['src', 'w', 'h', 'full']
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
