-- Festejados en la lista de regalos (eventos con varios cumpleanieros).
--
-- events.wishlist acepta dos claves nuevas, ambas opcionales:
--   * honorees: [{ id, name }] (hasta 6). Solo un nombre visible: no se enlaza a
--     las cuentas de event_owners, que no tienen nombre publico.
--   * items[].honoree_ids: ids de honorees a los que va el regalo (sin repetir).
--     Sin la clave, o vacia, el regalo es para todos.
-- Las wishlists guardadas antes siguen siendo validas. src/lib/wishlist.ts
-- (resolveWishlist / serializeWishlist) lee y escribe esta misma forma.

create or replace function public.valid_event_wishlist(w jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  k text;
  v_item jsonb;
  v_items jsonb;
  v_count int;
  v_url text;
  v_title text;
  v_img text;
  v_price text;
  v_notes text;
  v_id text;
  v_mode text;
  v_h jsonb;
  v_honoree_ids text[] := '{}';
  v_ref jsonb;
  v_refs text[];
begin
  if w is null or jsonb_typeof(w) <> 'object' then
    return false;
  end if;

  for k in select jsonb_object_keys(w) loop
    if k not in ('enabled', 'display_mode', 'title', 'honorees', 'items') then
      return false;
    end if;
  end loop;

  if w ? 'enabled' and jsonb_typeof(w -> 'enabled') <> 'boolean' then
    return false;
  end if;

  if w ? 'display_mode' then
    if jsonb_typeof(w -> 'display_mode') <> 'string' then
      return false;
    end if;
    v_mode := w ->> 'display_mode';
    if v_mode not in ('chip', 'card', 'banner') then
      return false;
    end if;
  end if;

  if w ? 'title' and w ->> 'title' is not null then
    if jsonb_typeof(w -> 'title') <> 'string' or char_length(btrim(w ->> 'title')) not between 1 and 60 then
      return false;
    end if;
  end if;

  -- honorees: hasta 6, cada uno { id (1..20), name (1..40) }, ids sin repetir
  if w ? 'honorees' then
    if jsonb_typeof(w -> 'honorees') <> 'array' or jsonb_array_length(w -> 'honorees') > 6 then
      return false;
    end if;
    for v_h in select * from jsonb_array_elements(w -> 'honorees') loop
      if jsonb_typeof(v_h) <> 'object' then
        return false;
      end if;
      for k in select jsonb_object_keys(v_h) loop
        if k not in ('id', 'name') then
          return false;
        end if;
      end loop;
      if jsonb_typeof(v_h -> 'id') is distinct from 'string'
         or jsonb_typeof(v_h -> 'name') is distinct from 'string'
         or char_length(btrim(v_h ->> 'id')) not between 1 and 20
         or char_length(btrim(v_h ->> 'name')) not between 1 and 40
         or (v_h ->> 'id') = any (v_honoree_ids) then
        return false;
      end if;
      v_honoree_ids := v_honoree_ids || (v_h ->> 'id');
    end loop;
  end if;

  if w ? 'items' then
    v_items := w -> 'items';
    if jsonb_typeof(v_items) <> 'array' then
      return false;
    end if;
    v_count := jsonb_array_length(v_items);
    if v_count > 30 then
      return false;
    end if;

    for i in 0 .. (v_count - 1) loop
      v_item := v_items -> i;
      if jsonb_typeof(v_item) <> 'object' then
        return false;
      end if;

      for k in select jsonb_object_keys(v_item) loop
        if k not in ('id', 'url', 'title', 'image_url', 'price', 'notes', 'honoree_ids') then
          return false;
        end if;
      end loop;

      v_id := v_item ->> 'id';
      if v_id is null or char_length(btrim(v_id)) not between 1 and 60 then
        return false;
      end if;

      v_url := v_item ->> 'url';
      if v_url is null or (v_url !~* '^https?://') or char_length(v_url) > 1000 then
        return false;
      end if;

      v_title := v_item ->> 'title';
      if v_title is null or char_length(btrim(v_title)) not between 1 and 120 then
        return false;
      end if;

      if v_item ? 'image_url' and v_item ->> 'image_url' is not null then
        v_img := v_item ->> 'image_url';
        if (v_img !~* '^https?://') or char_length(v_img) > 1000 then
          return false;
        end if;
      end if;

      if v_item ? 'price' and v_item ->> 'price' is not null then
        v_price := v_item ->> 'price';
        if char_length(btrim(v_price)) not between 1 and 30 then
          return false;
        end if;
      end if;

      if v_item ? 'notes' and v_item ->> 'notes' is not null then
        v_notes := v_item ->> 'notes';
        if char_length(btrim(v_notes)) not between 1 and 200 then
          return false;
        end if;
      end if;

      -- honoree_ids: solo ids que existen en honorees, sin repetir
      if v_item ? 'honoree_ids' then
        if jsonb_typeof(v_item -> 'honoree_ids') <> 'array' then
          return false;
        end if;
        v_refs := '{}';
        for v_ref in select * from jsonb_array_elements(v_item -> 'honoree_ids') loop
          if jsonb_typeof(v_ref) <> 'string'
             or not ((v_ref #>> '{}') = any (v_honoree_ids))
             or (v_ref #>> '{}') = any (v_refs) then
            return false;
          end if;
          v_refs := v_refs || (v_ref #>> '{}');
        end loop;
      end if;
    end loop;
  end if;

  return true;
end;
$$;
