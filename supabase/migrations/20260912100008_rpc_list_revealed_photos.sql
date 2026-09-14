-- Public contract: lets any guest (no session, no token even) see the
-- gallery once it's revealed. `photos` has no policy for `anon` at all
-- (same lockdown as `guests`), so a direct select is impossible even
-- filtered down to approved rows -- this is the read-only bridge, same
-- security-definer pattern as get_guest_by_token / get_photo_quota /
-- submit_photo. Never exposes guest_id or status, only what's safe to
-- hand to the client for building a signed URL.
-- drop-if-exists antes de create-or-replace: mismo motivo que en
-- get_guest_by_token (ver 20260911120006_rpc_get_guest_by_token.sql) --
-- necesario para que el arnés de test pueda reaplicar todas las
-- migraciones desde cero sin chocar contra el cambio de tipo de retorno de
-- 20260914100000_rpc_list_revealed_photos_created_at.sql.
drop function if exists public.list_revealed_photos();

create or replace function public.list_revealed_photos()
returns table (
  storage_path text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.storage_path
  from public.photos p, public.event_config e
  where p.status = 'approved'
    and e.photos_revealed_at is not null;
$$;

grant execute on function public.list_revealed_photos() to anon, authenticated;
