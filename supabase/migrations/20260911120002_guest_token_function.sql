-- Generates a random, non-sequential, non-guessable token for a guest's
-- invitation URL. 9 random bytes -> 12 base64 characters (72 bits of
-- entropy, no padding needed since 72 is a multiple of 6), normalized to a
-- URL-safe alphabet so it can be dropped straight into `/i/{token}` without
-- encoding. Never derived from any sequential id.
create or replace function public.generate_guest_token()
returns text
language sql
volatile
as $$
  select translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_');
$$;
