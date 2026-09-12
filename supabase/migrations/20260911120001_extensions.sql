-- pgcrypto gives us gen_random_uuid() and gen_random_bytes(), both used
-- below for primary keys and for generating non-sequential guest tokens.
-- It ships enabled by default on Supabase projects, but we enable it
-- explicitly so this migration is self-contained on a plain Postgres too.
create extension if not exists pgcrypto;
