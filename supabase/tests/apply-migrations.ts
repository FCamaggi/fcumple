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
