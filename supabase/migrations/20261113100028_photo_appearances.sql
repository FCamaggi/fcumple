-- ---------------------------------------------------------------------------
-- «Aparezco en esta foto»: cada invitado marca a mano las fotos publicadas donde sale y arma su album.
--
-- Sin biometria (ver docs/fase-1-mvp-multitenant/album-por-cara-investigacion.md, opcion C). Las marcas son
-- privadas: nadie lee ni escribe la tabla directo; el invitado marca con set_photo_appearance y ve sus propias
-- marcas en list_revealed_photos (columna nueva `appears`, por eso se borra y se vuelve a crear).
-- ---------------------------------------------------------------------------
create table public.photo_appearances (
  photo_id uuid not null references public.photos (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, guest_id)
);

create index photo_appearances_guest_idx on public.photo_appearances (guest_id);

alter table public.photo_appearances enable row level security;
revoke all on public.photo_appearances from public, anon, authenticated;

-- Marca (p_appears = true) o desmarca una foto publicada del evento del invitado. Idempotente: marcar dos veces o
-- desmarcar algo no marcado no falla. Una foto sin publicar, de otro evento o inexistente responde not_allowed
-- (42501) en los tres casos, para no revelar cuales existen. Devuelve el estado final.
create function public.set_photo_appearance(p_token text, p_storage_path text, p_appears boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest public.guests%rowtype;
  v_photo_id uuid;
begin
  select * into v_guest from public._approved_guest(p_token);
  if not found then
    raise exception 'no guest matches this token' using errcode = 'P0002';
  end if;

  select p.id into v_photo_id
  from public.photos p
  where p.storage_path = p_storage_path
    and p.event_id = v_guest.event_id
    and p.status = 'approved'
    and p.published_at is not null;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if coalesce(p_appears, false) then
    insert into public.photo_appearances (photo_id, guest_id)
    values (v_photo_id, v_guest.id)
    on conflict do nothing;
    return true;
  end if;

  delete from public.photo_appearances pa where pa.photo_id = v_photo_id and pa.guest_id = v_guest.id;
  return false;
end;
$$;

revoke all on function public.set_photo_appearance(text, text, boolean) from public;
grant execute on function public.set_photo_appearance(text, text, boolean) to anon, authenticated;

drop function public.list_revealed_photos(text);

create function public.list_revealed_photos(p_token text)
returns table (
  storage_path text,
  display_storage_path text,
  created_at timestamptz,
  appears boolean
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select p.storage_path, p.display_storage_path, p.created_at,
         exists (select 1 from public.photo_appearances pa where pa.photo_id = p.id and pa.guest_id = g.id)
  from public._approved_guest(p_token) g
  join public.photos p on p.event_id = g.event_id
  where p.status = 'approved'
    and p.published_at is not null
  order by p.created_at
  limit 1000;
$$;

grant execute on function public.list_revealed_photos(text) to anon, authenticated;
