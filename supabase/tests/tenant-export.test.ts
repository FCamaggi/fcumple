import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';
import { DATABASE_URL } from './db-config';
// @ts-expect-error -- script .mjs sin tipos
import { buildManifest, collectTenant } from '../../scripts/tenant/export-core.mjs';

let db: Client;
let alice: string;
let bob: string;
let evA: { id: string; slug: string };
let evB: { id: string; slug: string };
let guestA: { id: string; token: string };
let guestB: { id: string; token: string };

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);

  // Ensure metadata column exists on storage.objects in test environments
  await db.query('alter table storage.objects add column if not exists metadata jsonb default \'{}\'::jsonb');

  // Create two distinct users
  alice = await createUser(db, 'alice.export@example.com');
  bob = await createUser(db, 'bob.export@example.com');

  // Create two events (A and B)
  evA = await createEvent(db, alice, { slug: 'evento-alice-export', name: 'Evento Alice' });
  evB = await createEvent(db, bob, { slug: 'evento-bob-export', name: 'Evento Bob' });

  // Update activation codes with non-null secret values
  await db.query("update public.events set activation_code = 'secret_act_code_alice' where id = $1", [evA.id]);
  await db.query("update public.events set activation_code = 'secret_act_code_bob' where id = $1", [evB.id]);

  // Create guests for each event
  guestA = await createGuest(db, evA.id, 'Ana Export');
  guestB = await createGuest(db, evB.id, 'Bruno Export');

  // Insert credentials for guests (with pin_hash)
  await db.query(
    `insert into public.guest_credentials (guest_id, pin_hash, failed_count, locked_until) values
       ($1, 'bcrypt_hash_secret_a', 1, null),
       ($2, 'bcrypt_hash_secret_b', 3, now() + interval '15 minutes')`,
    [guestA.id, guestB.id],
  );

  // Insert photos for each event
  await db.query(
    `insert into public.photos (event_id, guest_id, storage_path, status) values
       ($1, $2, $3, 'approved'),
       ($4, $5, $6, 'approved')`,
    [
      evA.id,
      guestA.id,
      `${evA.id}/${guestA.id}/a.jpg`,
      evB.id,
      guestB.id,
      `${evB.id}/${guestB.id}/b.jpg`,
    ],
  );

  // Insert posts and post_images for each event
  const postA = await db.query<{ id: string }>(
    `insert into public.posts (event_id, title, body) values ($1, 'Aviso Alice', 'Cuerpo A') returning id`,
    [evA.id],
  );
  const postB = await db.query<{ id: string }>(
    `insert into public.posts (event_id, title, body) values ($1, 'Aviso Bob', 'Cuerpo B') returning id`,
    [evB.id],
  );

  await db.query(
    `insert into public.post_images (event_id, post_id, storage_path, position) values
       ($1, $2, $3, 0),
       ($4, $5, $6, 0)`,
    [evA.id, postA.rows[0].id, `${evA.id}/post-img-a.jpg`, evB.id, postB.rows[0].id, `${evB.id}/post-img-b.jpg`],
  );

  // Insert event_frames and event_stickers
  await db.query(
    `insert into public.event_frames (event_id, template, label) values
       ($1, 'capas', 'Marco Alice'),
       ($2, 'capas', 'Marco Bob')`,
    [evA.id, evB.id],
  );

  await db.query(
    `insert into public.event_stickers (event_id, kind, emoji) values
       ($1, 'emoji', '🎉'),
       ($2, 'emoji', '🎈')`,
    [evA.id, evB.id],
  );

  // Insert client_briefs for each slug
  await db.query(
    `insert into public.client_briefs (slug, respondent, answers) values
       ($1, 'Cliente Alice', '{"color": "rosa"}'::jsonb),
       ($2, 'Cliente Bob', '{"color": "verde"}'::jsonb)`,
    [evA.slug, evB.slug],
  );

  // Insert storage.objects rows for each event, including an orphan for event A
  await db.query(
    `insert into storage.objects (bucket_id, name) values
       ('party-photos', $1),
       ('post-images', $2),
       ('party-photos', $3),
       ('party-photos', $4),
       ('post-images', $5)`,
    [
      `${evA.id}/${guestA.id}/a.jpg`,
      `${evA.id}/post-img-a.jpg`,
      `${evA.id}/orphan-unreferenced.jpg`,
      `${evB.id}/${guestB.id}/b.jpg`,
      `${evB.id}/post-img-b.jpg`,
    ],
  );
});

afterAll(async () => {
  await db.end();
});

describe('tenant export core', () => {
  it('collectTenant: aísla los datos del evento A y excluye los del evento B', async () => {
    const result = await collectTenant(
      (sql: string, params: unknown[]) => db.query(sql, params),
      evA.slug,
    );

    // 1. Event verification
    expect(result.event).toBeDefined();
    expect(result.event.id).toBe(evA.id);
    expect(result.event.slug).toBe(evA.slug);

    // 2. Guests verification
    expect(result.tables.guests.length).toBeGreaterThan(0);
    for (const guest of result.tables.guests) {
      expect(guest.event_id).toBe(evA.id);
      expect(guest.event_id).not.toBe(evB.id);
    }

    // 3. Guest credentials verification
    expect(result.tables.guest_credentials.length).toBeGreaterThan(0);
    for (const cred of result.tables.guest_credentials) {
      expect(cred.guest_id).toBe(guestA.id);
      expect(cred.guest_id).not.toBe(guestB.id);
      expect(cred.failed_count).toBe(1);
    }

    // 4. Photos verification
    expect(result.tables.photos.length).toBeGreaterThan(0);
    for (const photo of result.tables.photos) {
      expect(photo.event_id).toBe(evA.id);
      expect(photo.event_id).not.toBe(evB.id);
    }

    // 5. Posts and post_images verification
    expect(result.tables.posts.length).toBeGreaterThan(0);
    for (const post of result.tables.posts) {
      expect(post.event_id).toBe(evA.id);
      expect(post.event_id).not.toBe(evB.id);
    }

    expect(result.tables.post_images.length).toBeGreaterThan(0);
    for (const postImg of result.tables.post_images) {
      expect(postImg.event_id).toBe(evA.id);
      expect(postImg.event_id).not.toBe(evB.id);
    }

    // 6. Frames and stickers verification
    expect(result.tables.event_frames.length).toBeGreaterThan(0);
    for (const frame of result.tables.event_frames) {
      expect(frame.event_id).toBe(evA.id);
      expect(frame.event_id).not.toBe(evB.id);
    }

    expect(result.tables.event_stickers.length).toBeGreaterThan(0);
    for (const sticker of result.tables.event_stickers) {
      expect(sticker.event_id).toBe(evA.id);
      expect(sticker.event_id).not.toBe(evB.id);
    }

    // 7. Client briefs verification
    expect(result.tables.client_briefs.length).toBeGreaterThan(0);
    for (const brief of result.tables.client_briefs) {
      expect(brief.slug).toBe(evA.slug);
      expect(brief.slug).not.toBe(evB.slug);
    }

    // 8. Storage objects verification (including orphan objects)
    expect(result.storageObjects.length).toBe(3);
    for (const obj of result.storageObjects) {
      expect(obj.name.startsWith(`${evA.id}/`)).toBe(true);
      expect(obj.name.startsWith(`${evB.id}/`)).toBe(false);
    }
    const names = result.storageObjects.map((o: { name: string }) => o.name);
    expect(names).toContain(`${evA.id}/orphan-unreferenced.jpg`);
  });

  it('no contiene la clave pin_hash en ninguna parte del resultado', async () => {
    const result = await collectTenant(
      (sql: string, params: unknown[]) => db.query(sql, params),
      evA.slug,
    );

    function findForbiddenKey(target: unknown, forbidden: string): boolean {
      if (!target || typeof target !== 'object') return false;
      if (Object.prototype.hasOwnProperty.call(target, forbidden)) return true;
      for (const val of Object.values(target)) {
        if (findForbiddenKey(val, forbidden)) return true;
      }
      return false;
    }

    expect(findForbiddenKey(result, 'pin_hash')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('pin_hash');
  });

  it('redacta activation_code del evento y token de los invitados a "[redactado]"', async () => {
    const result = await collectTenant(
      (sql: string, params: unknown[]) => db.query(sql, params),
      evA.slug,
    );

    expect(result.event.activation_code).toBe('[redactado]');
    expect(result.tables.guests.length).toBeGreaterThan(0);
    for (const guest of result.tables.guests) {
      expect(guest.token).toBe('[redactado]');
    }
  });

  it('con briefSlug exporta las respuestas de ese brief y no las del slug del evento', async () => {
    await db.query(
      `insert into public.client_briefs (slug, respondent, answers) values ('brief-propio', 'Cliente Carla', '{"color": "dorado"}'::jsonb)`,
    );
    const result = await collectTenant(
      (sql: string, params: unknown[]) => db.query(sql, params),
      evA.slug,
      { briefSlug: 'brief-propio' },
    );

    expect(result.event.id).toBe(evA.id);
    expect(result.tables.client_briefs.length).toBe(1);
    expect(result.tables.client_briefs[0].slug).toBe('brief-propio');
    expect(result.tables.client_briefs[0].respondent).toBe('Cliente Carla');
  });

  it('lanza un error con mensaje en español cuando el slug no existe', async () => {
    await expect(
      collectTenant((sql: string, params: unknown[]) => db.query(sql, params), 'evento-inexistente-xyz'),
    ).rejects.toThrow('No existe un evento con el slug "evento-inexistente-xyz".');
  });
});

describe('buildManifest unit tests', () => {
  it('genera conteos correctos y listas de exclusión y redacción', () => {
    const tables = {
      guests: [{ id: '1' }, { id: '2' }],
      guest_credentials: [{ guest_id: '1' }],
      photos: [{ id: 'p1' }],
      posts: [{ id: 'post1' }, { id: 'post2' }],
      post_images: [{ id: 'pi1' }],
      event_frames: [{ id: 'f1' }],
      event_stickers: [{ id: 's1' }, { id: 's2' }],
      client_briefs: [{ id: 'b1' }],
    };

    const files = [
      {
        bucket: 'party-photos',
        name: 'evt-id/g1/foto1.jpg',
        bytes: 12345,
        sha256: 'deadbeef1234',
      },
      {
        bucket: 'post-images',
        name: 'evt-id/cover.jpg',
        bytes: 54321,
        sha256: 'cafebebe5678',
      },
    ];

    const manifest = buildManifest({
      slug: 'fiesta-test',
      event: { id: 'evt-id', slug: 'fiesta-test' },
      tables,
      files,
      exportedAt: '2026-10-31T22:00:00.000Z',
    });

    expect(manifest.format).toBe('fcumple-tenant-export/v1');
    expect(manifest.slug).toBe('fiesta-test');
    expect(manifest.event_id).toBe('evt-id');
    expect(manifest.exported_at).toBe('2026-10-31T22:00:00.000Z');

    expect(manifest.counts).toEqual({
      guests: 2,
      guest_credentials: 1,
      photos: 1,
      posts: 2,
      post_images: 1,
      event_frames: 1,
      event_stickers: 2,
      client_briefs: 1,
      storage_objects: 2,
      files_downloaded: 2,
    });

    expect(manifest.files).toEqual(files);
    expect(manifest.redacted).toEqual(['events.activation_code', 'guests.token']);
    expect(manifest.excluded).toEqual(['guest_credentials.pin_hash', 'identify_attempts']);
  });

  it('cuenta los objetos listados aunque no se descarguen (--sin-archivos)', () => {
    const manifest = buildManifest({
      slug: 'fiesta-test',
      event: { id: 'evt-id', slug: 'fiesta-test' },
      storageObjects: [
        { bucket_id: 'party-photos', name: 'evt-id/g/a.jpg', metadata: null },
        { bucket_id: 'event-assets', name: 'evt-id/frames/b.webp', metadata: null },
      ],
      files: [],
    });

    expect(manifest.counts.storage_objects).toBe(2);
    expect(manifest.counts.files_downloaded).toBe(0);
    expect(manifest.files).toEqual([]);
  });

  it('maneja estructuras por defecto y parámetros vacíos', () => {
    const manifest = buildManifest({
      slug: 'evento-vacio',
      event: { id: 'evt-empty', slug: 'evento-vacio' },
    });

    expect(manifest.format).toBe('fcumple-tenant-export/v1');
    expect(manifest.slug).toBe('evento-vacio');
    expect(manifest.event_id).toBe('evt-empty');
    expect(typeof manifest.exported_at).toBe('string');
    expect(manifest.files).toEqual([]);
    expect(manifest.counts.storage_objects).toBe(0);
    expect(manifest.counts.guests).toBe(0);
    expect(manifest.counts.client_briefs).toBe(0);
    expect(manifest.redacted).toEqual(['events.activation_code', 'guests.token']);
    expect(manifest.excluded).toEqual(['guest_credentials.pin_hash', 'identify_attempts']);
  });
});

describe('export CLI', () => {
  it('escribe el respaldo solo legible por el dueño (carpeta 0700, archivos 0600)', async () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fcumple-export-'));
    const outDir = path.join(scratch, 'respaldo');
    try {
      const script = path.join(__dirname, '..', '..', 'scripts', 'tenant', 'export.mjs');
      await promisify(execFile)(process.execPath, [script, evA.slug, '--out', outDir, '--sin-archivos'], {
        env: { ...process.env, DATABASE_URL },
      });
      const mode = (p: string) => fs.statSync(p).mode & 0o777;
      expect(mode(outDir)).toBe(0o700);
      expect(mode(path.join(outDir, 'data.json'))).toBe(0o600);
      expect(mode(path.join(outDir, 'manifest.json'))).toBe(0o600);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
});
