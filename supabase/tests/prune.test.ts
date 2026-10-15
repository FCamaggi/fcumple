import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import {
  PRUNE_SCRIPT,
  applyLegacyMigrations,
  applyPhase1Migrations,
  asAnon,
  asUser,
  connect,
  prepareSupabaseLikeDatabase,
  resetPublicSchema,
} from './helpers';

// Reproduce el estado de produccion de la Fase 0 (sus 27 migraciones, datos,
// el admin en auth.users, archivos en Storage y el historial de migraciones),
// ejecuta el script de limpieza y comprueba que la Fase 1 queda sana y aislada.

let db: Client;
let adminId: string;
let legacyToken: string;

beforeAll(async () => {
  db = await connect();
  await prepareSupabaseLikeDatabase(db);
  await resetPublicSchema(db);

  await applyLegacyMigrations(db);

  const admin = await db.query<{ id: string }>(
    `insert into auth.users (email) values ('admin@fcumple.com') returning id`,
  );
  adminId = admin.rows[0].id;

  const guest = await db.query<{ id: string; token: string }>(
    `insert into public.guests (full_name) values ('Invitado Antiguo') returning id, token`,
  );
  legacyToken = guest.rows[0].token;
  await db.query(`insert into public.photos (guest_id, storage_path, status) values ($1, $2, 'approved')`, [
    guest.rows[0].id,
    `${legacyToken}/a.jpg`,
  ]);
  await db.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [
    `${legacyToken}/a.jpg`,
  ]);

  await db.query(`
    drop schema if exists supabase_migrations cascade;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key);
    insert into supabase_migrations.schema_migrations (version) values ('20260911120001'), ('20260922100001');
  `);
});

afterAll(async () => {
  await db.end();
});

describe('antes del prune (la trampa)', () => {
  it('un simple drop schema public cascade deja viva la politica que le abre party-photos a cualquier autenticado', async () => {
    await db.query('begin');
    await db.query('drop schema public cascade');
    const { rows } = await db.query(
      `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'`,
    );
    await db.query('rollback');

    expect(rows.map((r) => r.policyname)).toContain('authenticated_full_access');
  });
});

describe('prune-fase-0.sql', () => {
  let afterPrune = false;

  async function ensurePruned() {
    if (afterPrune) return;
    await db.query(readFileSync(PRUNE_SCRIPT, 'utf-8'));
    afterPrune = true;
  }

  it('deja `public` sin ninguna tabla ni funcion de la Fase 0', async () => {
    await ensurePruned();
    const tables = await db.query(`select table_name from information_schema.tables where table_schema = 'public'`);
    expect(tables.rows).toEqual([]);
    const functions = await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`,
    );
    expect(functions.rows).toEqual([]);
  });

  it('no deja ninguna politica en storage.objects', async () => {
    await ensurePruned();
    const { rows } = await db.query(
      `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'`,
    );
    expect(rows).toEqual([]);
  });

  it('conserva los usuarios de Auth y los archivos de Storage (no se pueden borrar con SQL)', async () => {
    await ensurePruned();
    const users = await db.query(`select email from auth.users`);
    expect(users.rows).toEqual([{ email: 'admin@fcumple.com' }]);
    const objects = await db.query(`select name from storage.objects`);
    expect(objects.rows).toHaveLength(1);
  });

  it('vacia el historial de migraciones para que `db push` aplique la Fase 1 desde cero', async () => {
    await ensurePruned();
    const { rows } = await db.query(`select count(*)::int as n from supabase_migrations.schema_migrations`);
    expect(rows[0].n).toBe(0);
  });

  it('es seguro volver a ejecutarlo', async () => {
    await ensurePruned();
    await expect(db.query(readFileSync(PRUNE_SCRIPT, 'utf-8'))).resolves.toBeDefined();
  });
});

describe('Fase 1 sobre el proyecto podado', () => {
  it('las migraciones de la Fase 1 se aplican sin errores', async () => {
    await db.query(readFileSync(PRUNE_SCRIPT, 'utf-8'));
    await expect(applyPhase1Migrations(db)).resolves.toBeUndefined();
  });

  it('la cuenta de admin que sobrevivio puede usarse como organizador', async () => {
    const { rows } = await asUser(db, adminId, () => db.query(`select * from create_event('Primer evento nuevo')`));
    expect(rows[0].owner_id).toBe(adminId);
  });

  it('un organizador NO ve los archivos de la Fase 0 ni de otros eventos (la trampa quedo cerrada)', async () => {
    const other = await db.query<{ id: string }>(`insert into auth.users (email) values ('otra@example.com') returning id`);
    const visible = await asUser(db, other.rows[0].id, () =>
      db.query(`select name from storage.objects where bucket_id = 'party-photos'`),
    );
    expect(visible.rows).toEqual([]);

    const asAdmin = await asUser(db, adminId, () =>
      db.query(`select name from storage.objects where bucket_id = 'party-photos'`),
    );
    expect(asAdmin.rows).toEqual([]);
  });

  it('un invitado anonimo tampoco puede leer ni subir usando un token de la Fase 0', async () => {
    const read = await asAnon(db, () => db.query(`select name from storage.objects where bucket_id = 'party-photos'`));
    expect(read.rows).toEqual([]);
    await expect(
      asAnon(db, () =>
        db.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [`${legacyToken}/b.jpg`]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
