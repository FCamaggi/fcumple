-- Public contract: the ONLY way an unauthenticated guest can read their own
-- row. SECURITY DEFINER lets it read public.guests despite guests having no
-- anon-facing RLS policy; `search_path` is pinned so a malicious search_path
-- can't hijack an unqualified identifier inside the function body.
-- Deliberately excludes admin_note. A nonexistent or empty token simply
-- matches no row via plain equality -- there is no separate "not found"
-- branch, so an invalid token can't be distinguished from one that "almost"
-- matches.
-- drop-if-exists antes de create-or-replace: no cambia el comportamiento en
-- una aplicación normal (una sola vez, en orden), pero hace que este archivo
-- sea seguro de re-aplicar después de que una migración posterior
-- (20260913110000_expose_checked_in_at_to_guest.sql) cambie el tipo de
-- retorno de esta misma función -- necesario porque el arnés de test
-- (supabase/tests/apply-migrations.ts) reaplica TODAS las migraciones desde
-- cero en cada archivo de test, sobre el mismo Postgres compartido.
drop function if exists public.get_guest_by_token(text);

create or replace function public.get_guest_by_token(p_token text)
returns table (
  id uuid,
  full_name text,
  status text,
  plus_ones_allowed int,
  plus_ones_confirmed int,
  guest_note text,
  responded_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select g.id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed, g.guest_note, g.responded_at
  from public.guests g
  where g.token = p_token;
$$;

grant execute on function public.get_guest_by_token(text) to anon, authenticated;
