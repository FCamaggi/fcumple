-- Borra el evento de prueba 'demo-fase-1' y todo lo que cuelga de él
-- (invitados, PIN, fotos, avisos, marcos, stickers) más sus archivos en Storage.
do $$
declare v_event uuid;
begin
  select id into v_event from public.events where slug = 'demo-fase-1';
  if v_event is null then
    raise notice 'No hay evento demo-fase-1.';
    return;
  end if;
  delete from storage.objects
   where bucket_id in ('party-photos', 'post-images', 'event-assets')
     and name like v_event::text || '/%';
  delete from public.events where id = v_event;
end $$;
