-- Generic "bump updated_at on every update" trigger function, reused by
-- any table that has an `updated_at` column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
