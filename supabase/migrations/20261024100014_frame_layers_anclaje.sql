-- Marcos por capas: anclaje a los bordes (dx, dy y box).
--
-- Hasta ahora una capa se ubicaba por fracciones del lienzo y todo lo demas se medía en "lado menor", asi que un
-- marco pensado para una foto vertical 3:4 no llegaba a los bordes en horizontal ni en una camara 9:16. Dos claves
-- opcionales lo resuelven (las capas que ya existen no cambian):
--   * dx, dy (todas las capas): desplazamiento desde (x, y), relativo al lado menor. Entre -2 y 2.
--   * box (solo rect y line): la forma queda pegada a los bordes del lienzo. Es un objeto con alguno de l, t, r, b
--     (margenes relativos al lado menor, entre 0 y 1); no puede estar vacio.
-- La misma regla vive en src/lib/cameraAssets/layers.ts (validateLayers) y supabase/tests/frame-layers.test.ts
-- prueba la misma tabla de casos contra las dos.

create or replace function public._frame_box(b jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(b) = 'object'
    and exists (select 1 from jsonb_object_keys(b))
    and not exists (select 1 from jsonb_object_keys(b) k where k not in ('l', 't', 'r', 'b'))
    and public._frame_num(b, 'l', 0, 1)
    and public._frame_num(b, 't', 0, 1)
    and public._frame_num(b, 'r', 0, 1)
    and public._frame_num(b, 'b', 0, 1),
    false);
$$;

-- Una capa. p_event es el evento dueno del marco: las imagenes tienen que estar en SU carpeta.
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
      where k not in ('type', 'x', 'y', 'dx', 'dy', 'rotation', 'opacity', 'anchor', 'shadow')
        and k not in (
          select unnest(case x ->> 'type'
            when 'text' then array['text', 'size', 'font', 'color', 'weight', 'w', 'strokeColor', 'strokeWidth']
            when 'shape' then array['shape', 'w', 'h', 'fill', 'stroke', 'strokeWidth', 'radius', 'd', 'box']
            when 'image' then array['src', 'w', 'h', 'full']
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
    and (not (x ? 'shadow') or public._frame_shadow(x -> 'shadow'))
    and case x ->> 'type'
      when 'text' then
        jsonb_typeof(x -> 'text') = 'string'
        and char_length(btrim(x ->> 'text')) >= 1
        and char_length(x ->> 'text') <= 60
        and public._frame_num(x, 'size', 0.005, 1)
        -- Las del sistema y las web de las capas (ver LAYER_FONTS en src/lib/cameraAssets/text.ts).
        and (not (x ? 'font') or (x ->> 'font') in ('sans', 'serif', 'mono', 'display', 'hand', 'typewriter',
                                                    'anton', 'playfair', 'pacifico', 'marker', 'elite'))
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
      else
        jsonb_typeof(x -> 'emoji') = 'string'
        and char_length(x ->> 'emoji') between 1 and 32
        and public._frame_num(x, 'size', 0.01, 1)
    end,
    false);
$$;
