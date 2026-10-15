-- Buckets privados. Rutas:
--   party-photos  {event_id}/{guest_id}/{archivo}
--   post-images   {event_id}/{archivo}
insert into storage.buckets (id, name, public)
values ('party-photos', 'party-photos', false), ('post-images', 'post-images', false)
on conflict (id) do nothing;

-- Las politicas de storage.objects corren con los privilegios del rol que
-- consulta (anon): estas funciones SECURITY DEFINER son el puente para
-- preguntar sin darle acceso directo a las tablas.

create or replace function public.guest_folder_exists(p_event text, p_guest text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.guests g
    where g.event_id = public.safe_uuid(p_event)
      and g.id = public.safe_uuid(p_guest)
      and g.approval_status = 'approved'
  );
$$;

create or replace function public.storage_event_owner(p_event text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_event_owner(public.safe_uuid(p_event));
$$;

create or replace function public.party_photo_is_revealed(p_path text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.photos p
    join public.events e on e.id = p.event_id
    where (p.storage_path = p_path or p.display_storage_path = p_path)
      and p.status = 'approved'
      and e.photos_revealed_at is not null
  );
$$;

create or replace function public.post_image_path_is_public(p_path text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from public.post_images pi
      join public.posts p on p.id = pi.post_id
      where pi.storage_path = p_path
        and p.published_at is not null and p.published_at <= now()
    )
    or exists (
      select 1 from public.posts p
      where p.cover_image_path = p_path
        and p.published_at is not null and p.published_at <= now()
    );
$$;

grant execute on function public.guest_folder_exists(text, text) to anon, authenticated;
grant execute on function public.storage_event_owner(text) to anon, authenticated;
grant execute on function public.party_photo_is_revealed(text) to anon, authenticated;
grant execute on function public.post_image_path_is_public(text) to anon, authenticated;

-- Invitado: solo puede subir dentro de SU carpeta {event_id}/{guest_id}/.
-- El cupo lo aplica submit_photo (atomico), no esta politica.
create policy "guest_insert_own_folder" on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'party-photos'
    and cardinality(storage.foldername(name)) = 2
    and public.guest_folder_exists((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

-- Lectura de fotos aprobadas, solo con el rollo revelado.
create policy "public_read_approved_revealed" on storage.objects
  for select
  to anon
  using (bucket_id = 'party-photos' and public.party_photo_is_revealed(name));

-- Organizador: acceso total a los archivos de SUS eventos.
create policy "owner_party_photos" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'party-photos' and public.storage_event_owner((storage.foldername(name))[1]))
  with check (bucket_id = 'party-photos' and public.storage_event_owner((storage.foldername(name))[1]));

create policy "owner_post_images" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'post-images' and public.storage_event_owner((storage.foldername(name))[1]))
  with check (bucket_id = 'post-images' and public.storage_event_owner((storage.foldername(name))[1]));

create policy "public_read_published_post_images" on storage.objects
  for select
  to anon
  using (bucket_id = 'post-images' and public.post_image_path_is_public(name));
