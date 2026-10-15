-- Presupuesto de consultas del camino rut_lookup.
--
-- Cada consulta a un proveedor de identidad cuesta dinero (y expone un RUT a
-- un tercero), asi que /api/identify debe limitarlas ANTES de llamarlo, y no
-- solo los fallos como en identify_guest: aqui cuenta cada consulta. Reutiliza
-- identify_attempts; no guarda nada del RUT (ni siquiera lo recibe).
--
-- Solo service_role: la llama la funcion serverless con la IP del cliente.
create or replace function public.register_verified_lookup(p_event_id uuid, p_client_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := coalesce(nullif(btrim(p_client_key), ''), 'unknown');
begin
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  delete from public.identify_attempts a where a.attempted_at < now() - interval '1 hour';

  if (select count(*) from public.identify_attempts a
       where a.event_id = p_event_id and a.client_key = v_key
         and a.attempted_at > now() - interval '10 minutes') >= 10
     or (select count(*) from public.identify_attempts a
          where a.event_id = p_event_id
            and a.attempted_at > now() - interval '10 minutes') >= 60
  then
    raise exception 'too many lookups, try again later' using errcode = '53400';
  end if;

  insert into public.identify_attempts (event_id, client_key) values (p_event_id, v_key);
end;
$$;

revoke execute on function public.register_verified_lookup(uuid, text) from public, anon, authenticated;
grant execute on function public.register_verified_lookup(uuid, text) to service_role;
