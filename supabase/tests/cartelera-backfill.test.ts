import { copyFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { applyMigrationsFrom, connect, createEvent, createGuest, createUser, resetPublicSchema } from './helpers';

const MIGRATIONS = path.join(__dirname, '..', 'migrations');
const NEW = '20261024100013_cartelera_activacion_tema.sql';

let db: Client;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db.end();
});

/**
 * Producción ya tiene eventos y fotos cuando llega esta migración. Se reproduce: se aplican todas las
 * migraciones MENOS la nueva, se cargan datos del modelo anterior y recién entonces se aplica la nueva.
 */
describe('la migración sobre datos que ya existían', () => {
  it('lo que ya estaba revelado sigue visible, lo demás no, y los eventos existentes conservan su modo de cámara', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'fcumple-mig-'));
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && n < NEW)) {
      copyFileSync(path.join(MIGRATIONS, f), path.join(tmp, f));
    }
    await resetPublicSchema(db);
    await applyMigrationsFrom(db, tmp);

    const owner = await createUser(db, 'dueña@example.com');
    const revealed = await createEvent(db, owner, { camera_unlock: 'on_identify' });
    const hidden = await createEvent(db, owner, { camera_unlock: 'on_checkin' });
    const gRevealed = await createGuest(db, revealed.id, 'Ana Rojas');
    const gHidden = await createGuest(db, hidden.id, 'Bea Soto');
    const photo = (eventId: string, guestId: string, name: string, status: string) =>
      db.query(
        `insert into photos (event_id, guest_id, storage_path, status) values ($1, $2, $3, $4)`,
        [eventId, guestId, `${eventId}/${guestId}/${name}.jpg`, status],
      );
    await photo(revealed.id, gRevealed.id, 'ok', 'approved');
    await photo(revealed.id, gRevealed.id, 'pendiente', 'pending');
    await photo(revealed.id, gRevealed.id, 'rechazada', 'rejected');
    await photo(hidden.id, gHidden.id, 'ok', 'approved');
    await db.query(`update events set photos_revealed_at = '2026-10-18T22:00:00Z' where id = $1`, [revealed.id]);

    await db.query(readFileSync(path.join(MIGRATIONS, NEW), 'utf-8'));

    const rows = await db.query(
      `select e.slug, p.storage_path, p.status, p.published_at from photos p join events e on e.id = p.event_id order by p.storage_path`,
    );
    const byName = (name: string) => rows.rows.find((r) => String(r.storage_path).endsWith(`/${name}.jpg`) && r.slug === revealed.slug);
    expect(byName('ok')?.published_at).not.toBeNull();
    expect(new Date(byName('ok')?.published_at).toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(byName('pendiente')?.published_at).toBeNull();
    expect(byName('rechazada')?.published_at).toBeNull();
    expect(rows.rows.find((r) => r.slug === hidden.slug)?.published_at).toBeNull();

    // Los eventos que ya existían NO cambian de modo de cámara (solo los nuevos usan el QR por defecto).
    const modes = await db.query(`select camera_unlock from events order by camera_unlock`);
    expect(modes.rows.map((r) => r.camera_unlock)).toEqual(['on_checkin', 'on_identify']);

    // Cada evento existente recibió su propio código de activación.
    const codes = await db.query(`select activation_code from events`);
    expect(new Set(codes.rows.map((r) => r.activation_code)).size).toBe(2);
    expect(codes.rows.every((r) => /^[0-9a-f]{32}$/.test(r.activation_code))).toBe(true);
  });
});
