-- Public contract: the door scanner's only entry point. Marks the festive
-- "arrived" moment for a guest, decoupled from RSVP status -- it never
-- blocks on status, deadlines, or anything else (Etapa 3: "no limitante").
-- Idempotent by design: re-scanning the same token after check-in does NOT
-- overwrite checked_in_at (first arrival time wins), and does NOT raise --
-- the frontend distinguishes "first time" from "already here" by comparing
-- the returned checked_in_at against what it already knew, not via an error.
-- A token that matches no guest is the one case that DOES raise, mirroring
-- submit_rsvp's P0002 for "no guest matches this token" (see
-- supabase/README.md) so the frontend can reuse the same error-code contract.
create or replace function public.check_in_guest(p_token text)
returns table (
  id uuid,
  full_name text,
  status text,
  plus_ones_allowed int,
  plus_ones_confirmed int,
  guest_note text,
  responded_at timestamptz,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.guests g where g.token = p_token) then
    raise exception 'no guest matches this token'
      using errcode = 'P0002'; -- no_data_found
  end if;

  update public.guests g
  set checked_in_at = now()
  where g.token = p_token
    and g.checked_in_at is null;

  return query
  select g.id, g.full_name, g.status, g.plus_ones_allowed, g.plus_ones_confirmed,
         g.guest_note, g.responded_at, g.checked_in_at
  from public.guests g
  where g.token = p_token;
end;
$$;

grant execute on function public.check_in_guest(text) to anon, authenticated;
