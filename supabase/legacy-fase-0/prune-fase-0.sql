-- =============================================================================
-- PRUNE de la Fase 0  --  DESTRUCTIVO e IRREVERSIBLE
-- =============================================================================
-- Deja el proyecto Supabase actual listo para la Fase 1: borra TODO lo que
-- creo la Fase 0 (tablas, funciones, politicas) y el historial de migraciones.
--
-- QUE HACE
--   1. Borra todas las politicas de storage.objects. Es el paso mas importante:
--      `drop schema public cascade` NO se las lleva si no dependen de una
--      funcion de `public`, y la politica "authenticated_full_access" de la
--      Fase 0 (todo party-photos para cualquier usuario autenticado) quedaria
--      viva y le daria a CADA organizador acceso a las fotos de TODOS los
--      eventos.
--   2. Recrea el esquema `public` vacio, con los privilegios por defecto de
--      Supabase.
--   3. Vacia supabase_migrations.schema_migrations, para que `supabase db push`
--      aplique las migraciones de la Fase 1 desde cero.
--
-- QUE NO HACE (lo haces tu)
--   - Hacer un respaldo ANTES (pg_dump o Database > Backups). No hay deshacer.
--   - Vaciar los buckets party-photos y post-images: Supabase no permite
--     borrar storage.objects con SQL; hazlo en el panel (Storage). Los archivos
--     viejos quedan inaccesibles para la app nueva, pero ocupan espacio.
--   - Auth: los usuarios (p. ej. la cuenta de admin de la Fase 0) se conservan
--     y pueden usarse como organizador.
--
-- COMO EJECUTARLO: SQL Editor de Supabase (rol postgres) o psql. Todo corre en
-- una transaccion: si algo falla, no se aplica nada.
-- =============================================================================
begin;

do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end
$$;

drop schema public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to postgres, anon, authenticated, service_role;

do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    truncate supabase_migrations.schema_migrations;
  end if;
end
$$;

commit;
