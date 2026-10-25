-- Lista de deseos / regalos del evento (Fase 1)
-- Permite al organizador configurar enlaces a regalos con imagen extraída de OpenGraph,
-- título, precio o notas opcionales. Se almacena en events.wishlist como jsonb validado.

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
begin
  if w is null or jsonb_typeof(w) <> 'object' then
    return false;
  end if;

  -- Solo se permiten las claves conocidas
  for k in select jsonb_object_keys(w) loop
    if k not in ('enabled', 'display_mode', 'title', 'items') then
      return false;
    end if;
  end loop;

  -- enabled: boolean obligatorio si está presente
  if w ? 'enabled' and jsonb_typeof(w -> 'enabled') <> 'boolean' then
    return false;
  end if;

  -- display_mode: chip, card o banner
  if w ? 'display_mode' then
    if jsonb_typeof(w -> 'display_mode') <> 'string' then
      return false;
    end if;
    v_mode := w ->> 'display_mode';
    if v_mode not in ('chip', 'card', 'banner') then
      return false;
    end if;
  end if;

  -- title: opcional, hasta 60 caracteres
  if w ? 'title' and w ->> 'title' is not null then
    if jsonb_typeof(w -> 'title') <> 'string' or char_length(btrim(w ->> 'title')) not between 1 and 60 then
      return false;
    end if;
  end if;

  -- items: arreglo jsonb con máximo 30 items
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

      -- Claves de cada item
      for k in select jsonb_object_keys(v_item) loop
        if k not in ('id', 'url', 'title', 'image_url', 'price', 'notes') then
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
    end loop;
  end if;

  return true;
end;
$$;

alter table public.events
  add column wishlist jsonb not null default '{"enabled": false, "display_mode": "chip", "items": []}'::jsonb,
  add constraint events_wishlist_valid check (public.valid_event_wishlist(wishlist));

-- Actualizar get_event_public para incluir wishlist
drop function if exists public.get_event_public(text);

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
  wishlist jsonb
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select e.id, e.name, e.starts_at, e.location, e.rsvp_deadline, e.access_mode,
         e.camera_unlock, e.rsvp_enabled, (e.photos_revealed_at is not null), e.enrollment_config,
         e.subtitle, e.theme, e.wishlist
  from public.events e
  where e.slug = p_slug;
$$;

grant execute on function public.get_event_public(text) to anon, authenticated;
