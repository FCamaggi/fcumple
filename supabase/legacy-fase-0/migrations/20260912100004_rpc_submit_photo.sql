-- Public contract: the ONLY way a guest can register a photo's metadata
-- after uploading the file itself to Storage (the storage.objects insert
-- policy handles the file upload separately; this RPC registers the
-- moderation row and is the single place that atomically enforces cupo).
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
  v_used int;
  v_prefix text;
begin
  select g.id, g.photo_quota into v_guest_id, v_quota
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

  return query
  insert into public.photos (guest_id, storage_path)
  values (v_guest_id, p_storage_path)
  returning photos.id, photos.guest_id, photos.storage_path, photos.status, photos.created_at;
end;
$$;

grant execute on function public.submit_photo(text, text) to anon, authenticated;
