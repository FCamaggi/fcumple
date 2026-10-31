import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asAnon, connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';

/**
 * events.camera_closes_at: pasada la hora limite no entran fotos NUEVAS (ni en submit_photo ni en la subida a
 * Storage), pero un reintento de una foto ya registrada sigue devolviendo su fila.
 */

let db: Client;
let owner: string;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
  owner = await createUser(db, 'organizador@example.com');
});

afterAll(async () => {
  await db.end();
});

const submit = (token: string, path: string) =>
  asAnon(db, () => db.query('select * from submit_photo($1, $2, null)', [token, path]));
const upload = (name: string) =>
  asAnon(db, () => db.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [name]));
const setClose = (eventId: string, sql: string) =>
  db.query(`update events set camera_closes_at = ${sql} where id = $1`, [eventId]);

describe('hora limite de la camara', () => {
  it('sin hora limite (null) todo sigue como antes', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas', { photo_quota: 5 });
    const { rows } = await submit(g.token, `${ev.id}/${g.id}/a.jpg`);
    expect(rows).toHaveLength(1);
    await expect(upload(`${ev.id}/${g.id}/b.jpg`)).resolves.toBeDefined();
  });

  it('con la hora en el futuro aun se puede', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Beto Soto', { photo_quota: 5 });
    await setClose(ev.id, "now() + interval '1 hour'");
    await expect(submit(g.token, `${ev.id}/${g.id}/a.jpg`)).resolves.toBeDefined();
    await expect(upload(`${ev.id}/${g.id}/a.jpg`)).resolves.toBeDefined();
  });

  it('pasada la hora, submit_photo rechaza la foto nueva con 55000 y no gasta cupo', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Carla Paz', { photo_quota: 5 });
    await setClose(ev.id, "now() - interval '1 minute'");
    await expect(submit(g.token, `${ev.id}/${g.id}/a.jpg`)).rejects.toMatchObject({ code: '55000' });
    const { rows } = await db.query('select count(*)::int as n from photos where guest_id = $1', [g.id]);
    expect(rows[0].n).toBe(0);
  });

  it('pasada la hora, la subida a Storage tambien se rechaza', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Dani Vega', { photo_quota: 5 });
    await setClose(ev.id, "now() - interval '1 minute'");
    await expect(upload(`${ev.id}/${g.id}/a.jpg`)).rejects.toMatchObject({ code: '42501' });
  });

  it('un reintento de una foto ya registrada sigue devolviendo su fila tras el cierre', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Eva Luna', { photo_quota: 5 });
    const path = `${ev.id}/${g.id}/a.jpg`;
    const first = await submit(g.token, path);
    await setClose(ev.id, "now() - interval '1 minute'");
    const retry = await submit(g.token, path);
    expect(retry.rows[0].id).toBe(first.rows[0].id);
  });

  it('reabrir (null o una hora futura) vuelve a permitir fotos', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Fito Mena', { photo_quota: 5 });
    await setClose(ev.id, "now() - interval '1 minute'");
    await expect(submit(g.token, `${ev.id}/${g.id}/a.jpg`)).rejects.toMatchObject({ code: '55000' });
    await setClose(ev.id, 'null');
    await expect(submit(g.token, `${ev.id}/${g.id}/a.jpg`)).resolves.toBeDefined();
  });

  it('get_event_public entrega la hora limite', async () => {
    const ev = await createEvent(db, owner);
    await setClose(ev.id, "'2026-10-31 03:00:00+00'");
    const pub = await asAnon(db, () => db.query('select * from get_event_public($1)', [ev.slug]));
    expect(new Date(pub.rows[0].camera_closes_at).toISOString()).toBe('2026-10-31T03:00:00.000Z');
  });
});
