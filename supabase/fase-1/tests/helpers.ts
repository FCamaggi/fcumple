import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { createStorageSchema, createSupabaseRoles } from '../../tests/apply-migrations';
import { DATABASE_URL } from './db-config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Andamiaje de prueba: el esquema `auth` que Supabase provee en un proyecto
// real (auth.users y auth.uid()). Las migraciones lo referencian, no lo crean.
async function createAuthSchema(client: Client): Promise<void> {
  await client.query(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text
    );
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
  `);
}

// En Supabase, pgcrypto (gen_random_bytes, crypt, gen_salt) vive en el esquema
// `extensions`, NO en `public`, y los roles lo tienen en su search_path. Las
// funciones SECURITY DEFINER de las migraciones fijan `search_path`, asi que
// deben incluir `extensions` para encontrarlas. Replicarlo aqui hace fallar un
// search_path incorrecto en los tests en vez de en produccion.
async function createExtensionsSchema(client: Client): Promise<void> {
  await client.query(`
    create schema if not exists extensions;
    drop extension if exists pgcrypto cascade;
    create extension pgcrypto with schema extensions;
    grant usage on schema extensions to anon, authenticated, service_role;
    alter role anon set search_path = "$user", public, extensions;
    alter role authenticated set search_path = "$user", public, extensions;
    alter role service_role set search_path = "$user", public, extensions;
    alter role postgres set search_path = "$user", public, extensions;
    set search_path = "$user", public, extensions;
  `);
}

// Deja la base como un proyecto Supabase recien creado y aplica las
// migraciones de la Fase 1 desde cero. Imita los privilegios por defecto de
// Supabase (anon/authenticated/service_role reciben todo en `public`), de modo
// que un `revoke` olvidado en una migracion SI haga fallar los tests.
export async function resetAndMigrate(client: Client): Promise<void> {
  await createSupabaseRoles(client);
  await createExtensionsSchema(client);
  await createAuthSchema(client);
  await createStorageSchema(client);

  // Las politicas de storage.objects viven fuera de `public`: `drop schema
  // public cascade` solo se las lleva si dependen de una funcion de ese
  // esquema, asi que se borran todas explicitamente.
  await client.query(`
    do $$
    declare p record;
    begin
      for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
        execute format('drop policy %I on storage.objects', p.policyname);
      end loop;
    end
    $$;
  `);

  await client.query(`
    drop schema if exists public cascade;
    create schema public;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    truncate storage.objects;
    delete from storage.buckets;
    truncate auth.users cascade;
    select set_config('request.headers', '', false);
    select set_config('request.jwt.claim.sub', '', false);
  `);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    try {
      await client.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
}

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

export async function asAnon<T>(client: Client, fn: () => Promise<T>, ip?: string): Promise<T> {
  await client.query('set role anon');
  await client.query(`select set_config('request.headers', $1, false)`, [
    ip ? JSON.stringify({ 'x-forwarded-for': ip }) : '',
  ]);
  try {
    return await fn();
  } finally {
    await client.query(`select set_config('request.headers', '', false)`);
    await client.query('reset role');
  }
}

export async function asUser<T>(client: Client, userId: string, fn: () => Promise<T>): Promise<T> {
  await client.query('set role authenticated');
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  try {
    return await fn();
  } finally {
    await client.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await client.query('reset role');
  }
}

export async function asServiceRole<T>(client: Client, fn: () => Promise<T>): Promise<T> {
  await client.query('set role service_role');
  try {
    return await fn();
  } finally {
    await client.query('reset role');
  }
}

export async function createUser(client: Client, email: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  );
  return rows[0].id;
}

export async function createEvent(
  client: Client,
  ownerId: string,
  overrides: Partial<{
    slug: string;
    name: string;
    access_mode: string;
    camera_unlock: string;
    rsvp_enabled: boolean;
  }> = {},
): Promise<{ id: string; slug: string }> {
  const slug = overrides.slug ?? `evento-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await client.query<{ id: string; slug: string }>(
    `insert into public.events (owner_id, slug, name, access_mode, camera_unlock, rsvp_enabled)
     values ($1, $2, $3, $4, $5, $6) returning id, slug`,
    [
      ownerId,
      slug,
      overrides.name ?? 'Evento de prueba',
      overrides.access_mode ?? 'open',
      overrides.camera_unlock ?? 'on_identify',
      overrides.rsvp_enabled ?? false,
    ],
  );
  return rows[0];
}

export async function createGuest(
  client: Client,
  eventId: string,
  fullName: string,
  extra: Partial<{
    plus_ones_allowed: number;
    photo_quota: number;
    auto_approve_photos: boolean;
    approval_status: string;
    status: string;
  }> = {},
): Promise<{ id: string; token: string }> {
  const { rows } = await client.query<{ id: string; token: string }>(
    `insert into public.guests (event_id, full_name, plus_ones_allowed, photo_quota, auto_approve_photos, approval_status, status)
     values ($1, $2, $3, $4, $5, $6, $7) returning id, token`,
    [
      eventId,
      fullName,
      extra.plus_ones_allowed ?? 0,
      extra.photo_quota ?? 5,
      extra.auto_approve_photos ?? true,
      extra.approval_status ?? 'approved',
      extra.status ?? 'pending',
    ],
  );
  return rows[0];
}
