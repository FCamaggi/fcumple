-- Richer posts: an optional subtitle, an optional cover image, and an
-- optional gallery of extra photos per post. Same access model as the
-- rest of `posts` -- anon/authenticated read published posts directly,
-- no RPC involved -- extended to the new table and the new bucket.

alter table public.posts
  add column if not exists subtitle text,
  add column if not exists cover_image_path text;

-- post_images holds the gallery: zero or more extra photos per post,
-- ordered by `position`. The actual bytes live in the post-images Storage
-- bucket (see the next migration); this table is what PostsPanel lists
-- and reorders, and what the storage.objects read policy checks against.
create table if not exists public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_images_post_id_idx on public.post_images (post_id);

alter table public.post_images enable row level security;

-- Same visibility rule as `posts.public_read_published`, but reached via a
-- join since the flag lives on the parent row: a gallery image is only
-- visible once its post is actually published (published_at set and not
-- in the future). A draft's images stay invisible to anon/authenticated
-- readers, same as the draft post itself.
drop policy if exists "public_read_published" on public.post_images;
create policy "public_read_published" on public.post_images
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_images.post_id
        and p.published_at is not null
        and p.published_at <= now()
    )
  );

-- The admin (authenticated) needs full CRUD to manage the gallery: add,
-- reorder, remove images regardless of the post's publish state.
drop policy if exists "authenticated_all" on public.post_images;
create policy "authenticated_all" on public.post_images
  for all
  to authenticated
  using (true)
  with check (true);

grant select on public.post_images to anon;
grant select, insert, update, delete on public.post_images to authenticated;

-- Seed a draft "how to use this app" post so the admin has something to
-- review/edit/publish from PostsPanel instead of starting from a blank
-- slate. Left as a draft (published_at null) on purpose -- the admin
-- reviews it and adds a cover image by hand before publishing. Idempotent
-- on title, same idempotency approach as the DEV guest seed in
-- 20260913090000_dev_guest_support.sql, so re-running this migration
-- never creates a duplicate.
insert into public.posts (title, subtitle, body, published_at)
select
  'Guía rápida: qué podés hacer acá',
  'Todo lo que tenés disponible en la app, en cuatro pasos',
  '1. Confirmá tu entrada. Movés el fader a VOY o NO VOY y avisás cuántos acompañantes llevás — podés cambiar tu respuesta después si algo cambia.

2. Mostrá tu QR en la puerta. Una vez que confirmaste, tu invitación tiene un botón para mostrar un QR. Te lo escanean al llegar y ahí se desbloquea la cámara.

3. Sacá fotos con tu rollo digital. Tenés un cupo limitado de fotos, como una cámara descartable real — la gracia es que no es ilimitado. Se ven todas juntas recién cuando revelemos el rollo después del evento.

4. Volvé por acá. En esta cartelera vas a encontrar avisos, la cuenta regresiva, y — cuando llegue el momento — el rollo revelado.',
  null
where not exists (
  select 1 from public.posts where title = 'Guía rápida: qué podés hacer acá'
);
