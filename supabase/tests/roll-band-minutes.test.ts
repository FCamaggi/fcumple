import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asAnon, asUser, connect, createEvent, createUser, resetAndMigrate } from './helpers';

/**
 * events.roll_band_minutes: el intervalo de las bandas del rollo revelado, que elige la organizadora.
 * 60 por defecto (lo que había antes), solo valores que dividen el día y entregado al invitado por get_event_public.
 */

let db: Client;
let owner: string;
let stranger: string;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
  owner = await createUser(db, 'organizadora@example.com');
  stranger = await createUser(db, 'otra@example.com');
});

afterAll(async () => {
  await db.end();
});

const publicMinutes = async (slug: string) => {
  const { rows } = await asAnon(db, () =>
    db.query<{ roll_band_minutes: number }>('select roll_band_minutes from get_event_public($1)', [slug]),
  );
  return rows[0]?.roll_band_minutes;
};

describe('intervalo del rollo', () => {
  it('un evento nuevo usa 60 minutos y el invitado lo recibe', async () => {
    const ev = await createEvent(db, owner);
    const { rows } = await db.query<{ roll_band_minutes: number }>('select roll_band_minutes from events where id = $1', [ev.id]);
    expect(rows[0].roll_band_minutes).toBe(60);
    expect(await publicMinutes(ev.slug)).toBe(60);
  });

  it('la organizadora lo cambia y el invitado ve el valor nuevo', async () => {
    const ev = await createEvent(db, owner);
    for (const minutes of [15, 30, 90, 120, 180]) {
      await asUser(db, owner, () => db.query('update events set roll_band_minutes = $2 where id = $1', [ev.id, minutes]));
      expect(await publicMinutes(ev.slug)).toBe(minutes);
    }
  });

  it('rechaza los valores que no están en la lista', async () => {
    const ev = await createEvent(db, owner);
    for (const minutes of [0, -60, 45, 61, 1440]) {
      await expect(db.query('update events set roll_band_minutes = $2 where id = $1', [ev.id, minutes])).rejects.toMatchObject({
        code: '23514',
      });
    }
    await expect(db.query('update events set roll_band_minutes = null where id = $1', [ev.id])).rejects.toMatchObject({
      code: '23502',
    });
  });

  it('otra organizadora no lo puede cambiar', async () => {
    const ev = await createEvent(db, owner);
    await asUser(db, stranger, () => db.query('update events set roll_band_minutes = 15 where id = $1', [ev.id]));
    expect(await publicMinutes(ev.slug)).toBe(60);
  });

  it('get_event_public sigue entregando los demás campos', async () => {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_identify' });
    const { rows } = await asAnon(db, () => db.query('select * from get_event_public($1)', [ev.slug]));
    expect(rows[0]).toMatchObject({ id: ev.id, camera_unlock: 'on_identify', camera_closes_at: null, roll_band_minutes: 60 });
  });
});
