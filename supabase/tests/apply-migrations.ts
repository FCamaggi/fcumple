import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Roles that Supabase provisions automatically on a hosted project (anon,
// authenticated, service_role). Our migrations reference them in `grant` and
// `create policy ... to <role>` statements, so a plain postgres:16-alpine
// container needs them created before migrations run. This is test-only
// scaffolding, never part of the versioned migrations themselves.
export async function createSupabaseRoles(client: Client): Promise<void> {
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
    end
    $$;
  `);
}

// Plain postgres:16-alpine has no `storage` schema at all (it's a Supabase
// extension provisioned on every real hosted project, not part of stock
// Postgres). To actually exercise the storage.objects RLS policies from
// the party-photos migration against real Postgres (rather than skip that
// coverage), this recreates the minimal slice of Supabase's storage schema
// those policies depend on: storage.buckets, storage.objects, and the
// storage.foldername() helper used to split an object path into segments.
// Like createSupabaseRoles, this is test-only scaffolding and never part of
// the versioned migrations themselves.
export async function createStorageSchema(client: Client): Promise<void> {
  await client.query(`
    create schema if not exists storage;

    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text,
      owner uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table storage.buckets enable row level security;
    alter table storage.objects enable row level security;

    create or replace function storage.foldername(name text)
    returns text[]
    language plpgsql
    immutable
    as $fn$
    declare
      _parts text[];
    begin
      select string_to_array(name, '/') into _parts;
      return _parts[1:array_length(_parts, 1) - 1];
    end;
    $fn$;

    grant usage on schema storage to anon, authenticated;
    grant select on storage.buckets to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
}

export async function applyMigrations(client: Client): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    try {
      await client.query(sql);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
}

// Runs `fn` with the session's role switched to `role` (e.g. 'anon' or
// 'authenticated'), simulating how PostgREST connects on behalf of a given
// Supabase JWT claim, then resets back to the original role. `nologin` roles
// can still be reached this way because the connecting superuser is allowed
// to SET ROLE to any role without a password.
export async function asRole<T>(client: Client, role: string, fn: () => Promise<T>): Promise<T> {
  await client.query(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await client.query('reset role');
  }
}
