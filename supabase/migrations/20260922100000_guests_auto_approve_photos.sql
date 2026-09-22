-- Feature: por defecto, las fotos de cada invitado se auto-aprueban al
-- subirlas (saltan la cola de moderación por completo). El admin puede
-- marcar excepcionalmente a invitados puntuales (los que no confía en que
-- suban algo apropiado) para que sus fotos sigan cayendo en 'pending' y
-- necesiten revisión manual vía moderatePhoto. El default es
-- "auto-aprobado" -- el admin marca las excepciones, nunca al revés.
alter table public.guests
  add column if not exists auto_approve_photos boolean not null default true;

-- No hace falta ninguna policy nueva: `authenticated` ya tiene UPDATE
-- completo sobre `guests` vía la policy `authenticated_full_access` (ver
-- 20260911120004_create_guests.sql, `for all ... using (true) with check
-- (true)` más el `grant ... update ... to authenticated`), así que editar
-- esta columna desde el panel de admin ya funciona sin cambios de RLS.

-- El tipo de retorno de esta versión es idéntico al de
-- 20260912100004_rpc_submit_photo.sql (mismas 5 columnas/tipos, solo cambia
-- el cuerpo), así que un `create or replace` directo ya hubiera alcanzado.
-- El `drop` de todos modos es inofensivo y deja el archivo autocontenido
-- sin depender de qué firma haya quedado de una corrida previa.
drop function if exists public.submit_photo(text, text);

-- Público contract: la ÚNICA forma en que un invitado registra la metadata
-- de una foto después de subir el archivo a Storage (la policy de insert de
-- storage.objects maneja la subida del archivo por separado; esta RPC
-- registra la fila de moderación y es el único lugar que aplica el cupo de
-- forma atómica).
create or replace function public.submit_photo(
  p_token text,
  p_storage_path text
)
returns table (
  id uuid,
  guest_id uuid,
  storage_path text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_quota int;
  v_auto_approve boolean;
  v_used int;
  v_prefix text;
  v_status text;
begin
  select g.id, g.photo_quota, g.auto_approve_photos
    into v_guest_id, v_quota, v_auto_approve
  from public.guests g
  where g.token = p_token;

  if not found then
    raise exception 'no guest matches this token'
      using errcode = 'P0002'; -- no_data_found
  end if;

  v_prefix := p_token || '/';
  if left(p_storage_path, length(v_prefix)) <> v_prefix then
    raise exception 'storage_path must start with the guest token'
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  -- Every row counts against the quota regardless of status (pending,
  -- approved, or rejected) so a guest cannot spam uploads, get them
  -- rejected, and keep retrying indefinitely.
  select count(*) into v_used
  from public.photos p
  where p.guest_id = v_guest_id;

  if v_used >= v_quota then
    raise exception 'photo quota (%) already reached', v_quota
      using errcode = '22023';
  end if;

  v_status := case when v_auto_approve then 'approved' else 'pending' end;

  return query
  insert into public.photos (guest_id, storage_path, status)
  values (v_guest_id, p_storage_path, v_status)
  returning photos.id, photos.guest_id, photos.storage_path, photos.status, photos.created_at;
end;
$$;

grant execute on function public.submit_photo(text, text) to anon, authenticated;
