-- Evento de prueba para Fase 1. Ejecutar en el SQL Editor de Supabase.
-- 1) Crea tu cuenta de organizador en /panel (y confirma el correo).
-- 2) Cambia el correo de abajo por el de esa cuenta y ejecuta.
-- Resultado: evento "Demo Fase 1" en /e/demo-fase-1 con 3 marcos y 6 emojis
-- (los siembra el trigger), 2 invitados pre-cargados y 1 aviso publicado.
-- Los invitados se inscriben solos con su PIN; no hace falta crearlos.
-- Limpieza: supabase/seed-demo-cleanup.sql
do $$
declare
  v_owner uuid;
  v_event uuid;
begin
  select id into v_owner from auth.users where email = 'TU_CORREO@ejemplo.com';
  if v_owner is null then
    raise exception 'No existe un usuario con ese correo: crea la cuenta en /panel primero.';
  end if;

  insert into public.events (owner_id, slug, name, starts_at, location, camera_unlock, access_mode)
  values (v_owner, 'demo-fase-1', 'Demo Fase 1', now() + interval '7 days', 'Lugar de prueba', 'on_identify', 'open')
  returning id into v_event;

  insert into public.guests (event_id, full_name) values
    (v_event, 'Ana Prueba'),
    (v_event, 'Luis Demo');

  insert into public.posts (event_id, title, body, published_at)
  values (v_event, 'Bienvenidos', 'Este es un evento de prueba.', now());
end $$;
