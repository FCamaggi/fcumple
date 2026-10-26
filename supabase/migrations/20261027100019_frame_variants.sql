-- Variantes por proporción para los marcos de capas (`params.variants`).
--
-- Un marco puede guardar un diseño independiente para cada proporción del
-- lienzo ('3:4', '4:3', '1:1' y '9:16'). Cada variante lleva su propia lista
-- `layers` con el mismo tope de 40 capas y 32 KB que antes. `params.layers` se
-- conserva como espejo de '3:4' por compatibilidad con la cámara.
--
-- Topes de tamaño:
--   * El cliente limita `params` con `variants` a 65536 caracteres del JSON
--     compacto (`MAX_VARIANTS_PARAMS_LENGTH`) y cada variante (y `layers`) a
--     16384 caracteres (`MAX_LAYERS_PARAMS_LENGTH`).
--   * Aquí se mide `octet_length(jsonb::text)`, que formatea con espacios y
--     cuenta bytes UTF-8, por lo que el tope total sube a 128 KB (131072 bytes)
--     y el de cada variante o `layers` se mantiene en 32 KB (32768 bytes). Así
--     el cliente rechaza SIEMPRE antes que la base.
--
-- Ver `src/lib/cameraAssets/frames.ts` (`validateFrameParams`) y
-- `supabase/tests/frame-variants.test.ts`.

-- ---------------------------------------------------------------------------
-- (a) Validación de `params.variants`: objeto opcional donde cada clave es una
-- proporción conocida y cada valor es `{"layers": [...]}` dentro de 32 KB.
-- ---------------------------------------------------------------------------
create or replace function public.valid_frame_variants(v jsonb, p_event uuid)
returns boolean
language sql
immutable
as $$
  select case
    when v is null then true
    when jsonb_typeof(v) <> 'object' then false
    else not exists (
      select 1
      from jsonb_each(v) as e(k, val)
      where e.k not in ('3:4', '4:3', '1:1', '9:16')
         or case
              when jsonb_typeof(e.val) <> 'object' then true
              else exists (select 1 from jsonb_object_keys(e.val) vk where vk <> 'layers')
                or not (e.val ? 'layers')
                or jsonb_typeof(e.val -> 'layers') <> 'array'
                or octet_length(e.val::text) > 32768
                or not public.valid_frame_layers(e.val -> 'layers', p_event)
            end
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- (b) `valid_frame_params`: admite `variants` y sube el tope total a 128 KB
-- cuando está presente; si conviven `variants` y `layers`, `layers` conserva su
-- propio tope de 32 KB.
-- ---------------------------------------------------------------------------
create or replace function public.valid_frame_params(p jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= case when p ? 'variants' then 131072 when p ? 'layers' then 32768 else 2048 end
    and not exists (
      select 1 from jsonb_object_keys(p) k
      where k not in ('primaryColor', 'secondaryColor', 'textColor', 'title', 'subtitle',
                      'caption', 'font', 'thickness', 'radius', 'position', 'layers', 'variants')
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
    and (not (p ? 'layers')
         or (jsonb_typeof(p -> 'layers') = 'array'
             and (not (p ? 'variants') or octet_length((p -> 'layers')::text) <= 32768)))
    and (not (p ? 'variants') or jsonb_typeof(p -> 'variants') = 'object');
$$;

-- ---------------------------------------------------------------------------
-- (c) Restricción de fila: valida tanto `layers` como `variants` con el
-- `event_id` dueño del marco.
-- ---------------------------------------------------------------------------
alter table public.event_frames drop constraint if exists event_frames_layers_valid;
alter table public.event_frames
  add constraint event_frames_layers_valid
  check (
    public.valid_frame_layers(params -> 'layers', event_id)
    and public.valid_frame_variants(params -> 'variants', event_id)
  );

-- ---------------------------------------------------------------------------
-- Storage: un invitado puede leer la imagen de una capa de un marco activo si
-- aparece en `params -> 'layers'` (marcos antiguos o espejo de 3:4) O en
-- alguna variante (`params -> 'variants' -> <proporción> -> 'layers'`), ya que
-- una imagen puede existir solo en una proporción distinta de 3:4.
-- Aunque la restricción de la tabla exige que `variants` sea objeto y cada
-- `layers` sea lista, se protege `jsonb_each` y `jsonb_array_elements` con
-- `case when jsonb_typeof(...)` porque fallan si reciben otro tipo JSON.
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
      and (
        exists (
          select 1 from jsonb_array_elements(coalesce(f.params -> 'layers', '[]'::jsonb)) l
          where l ->> 'type' = 'image' and l ->> 'src' = p_path
        )
        or exists (
          select 1
          from jsonb_each(
            case when jsonb_typeof(f.params -> 'variants') = 'object' then f.params -> 'variants' else '{}'::jsonb end
          ) v(k, val),
          jsonb_array_elements(
            case when jsonb_typeof(val -> 'layers') = 'array' then val -> 'layers' else '[]'::jsonb end
          ) l
          where l ->> 'type' = 'image' and l ->> 'src' = p_path
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- (d) Backfill: los marcos anteriores (solo `layers`, sin `variants`) reciben
-- las cuatro proporciones con las mismas capas, conservando `layers`, siempre
-- que el resultado no supere los 64 KB (65536 bytes) para seguir siendo válido
-- en el cliente.
-- ---------------------------------------------------------------------------
update public.event_frames
set params = params || jsonb_build_object(
  'variants',
  jsonb_build_object(
    '3:4', jsonb_build_object('layers', params -> 'layers'),
    '4:3', jsonb_build_object('layers', params -> 'layers'),
    '1:1', jsonb_build_object('layers', params -> 'layers'),
    '9:16', jsonb_build_object('layers', params -> 'layers')
  )
)
where template = 'capas'
  and params ? 'layers'
  and jsonb_typeof(params -> 'layers') = 'array'
  and not (params ? 'variants')
  and octet_length(
    (
      params || jsonb_build_object(
        'variants',
        jsonb_build_object(
          '3:4', jsonb_build_object('layers', params -> 'layers'),
          '4:3', jsonb_build_object('layers', params -> 'layers'),
          '1:1', jsonb_build_object('layers', params -> 'layers'),
          '9:16', jsonb_build_object('layers', params -> 'layers')
        )
      )
    )::text
  ) <= 65536;
