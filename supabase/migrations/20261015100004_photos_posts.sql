create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_id uuid not null,
  -- {event_id}/{guest_id}/{archivo}: ids no secretos, nunca el token.
  storage_path text not null unique,
  display_storage_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  -- Una foto no puede colgar de un invitado de otro evento.
  constraint photos_guest_same_event
    foreign key (guest_id, event_id) references public.guests (id, event_id) on delete cascade
);

create index photos_event_idx on public.photos (event_id, created_at);
create index photos_guest_idx on public.photos (guest_id);

alter table public.photos enable row level security;
revoke all on public.photos from anon, authenticated;
grant select, insert, update, delete on public.photos to authenticated;

create policy "owner_all" on public.photos
  for all
  to authenticated
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null,
  subtitle text,
  body text not null,
  cover_image_path text,
  -- null = borrador; futuro = programado.
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint posts_id_event_unique unique (id, event_id)
);

create index posts_event_idx on public.posts (event_id, published_at);

alter table public.posts enable row level security;
revoke all on public.posts from anon, authenticated;
grant select, insert, update, delete on public.posts to authenticated;

create policy "owner_all" on public.posts
  for all
  to authenticated
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

create table public.post_images (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  post_id uuid not null,
  storage_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint post_images_post_same_event
    foreign key (post_id, event_id) references public.posts (id, event_id) on delete cascade
);

create index post_images_post_idx on public.post_images (post_id);

alter table public.post_images enable row level security;
revoke all on public.post_images from anon, authenticated;
grant select, insert, update, delete on public.post_images to authenticated;

create policy "owner_all" on public.post_images
  for all
  to authenticated
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));
