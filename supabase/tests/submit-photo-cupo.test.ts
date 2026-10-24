import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asAnon, connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';

/**
 * submit_photo: el cupo no se puede exceder con dos fotos nuevas simultáneas, y las rutas no admiten
 * segmentos `.`/`..` ni vacíos. La concurrencia se prueba con dos conexiones reales: la primera deja su
 * transacción abierta con el registro hecho (sin commit) y la segunda tiene que esperar a que termine.
 */

let db: Client;
let other: Client;
let owner: string;

beforeAll(async () => {
  db = await connect();
  other = await connect();
  await resetAndMigrate(db);
  owner = await createUser(db, 'organizador@example.com');
});

// Si un test falla a mitad de una transacción abierta, no contamina a los siguientes.
afterEach(async () => {
  for (const client of [db, other]) {
    await client.query('rollback');
    await client.query('reset role');
  }
});

afterAll(async () => {
  await other.end();
  await db.end();
});

const photoPath = (ev: { id: string }, g: { id: string }, file = 'f.jpg') => `${ev.id}/${g.id}/${file}`;
const submit = (token: string, path: string, display: string | null = null) =>
  asAnon(db, () => db.query('select * from submit_photo($1, $2, $3)', [token, path, display]));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('cupo con dos fotos nuevas a la vez', () => {
  it('la segunda espera a la primera y no pasa del cupo', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas', { photo_quota: 1 });

    // Primera foto: registrada pero sin commit, como si su transacción siguiera en curso.
    await db.query('begin');
    await db.query('set local role anon');
    await db.query('select * from submit_photo($1, $2, null)', [g.token, photoPath(ev, g, 'a.jpg')]);

    // Segunda foto, otra ruta, desde otra conexión: tiene que quedar esperando.
    await other.query('set role anon');
    let settled = false;
    const second = other
      .query('select * from submit_photo($1, $2, null)', [g.token, photoPath(ev, g, 'b.jpg')])
      .then(
        (r) => ({ ok: true as const, r }),
        (e: { code?: string }) => ({ ok: false as const, code: e.code }),
      )
      .finally(() => {
        settled = true;
      });
    await wait(400);
    expect(settled).toBe(false);

    await db.query('commit');
    const outcome = await second;
    await other.query('reset role');

    expect(outcome).toEqual({ ok: false, code: '22023' });
    const count = await db.query('select count(*)::int as n from photos where guest_id = $1', [g.id]);
    expect(count.rows[0].n).toBe(1);
  });

  it('la espera es por invitado: otro invitado del mismo evento no se bloquea', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas', { photo_quota: 1 });
    const h = await createGuest(db, ev.id, 'Beto Mora', { photo_quota: 1 });

    await db.query('begin');
    await db.query('set local role anon');
    await db.query('select * from submit_photo($1, $2, null)', [g.token, photoPath(ev, g)]);

    await other.query('set role anon');
    const free = await other.query('select * from submit_photo($1, $2, null)', [h.token, photoPath(ev, h)]);
    await other.query('reset role');
    await db.query('commit');

    expect(free.rows).toHaveLength(1);
  });

  it('un reintento de la misma ruta sigue devolviendo la misma fila (no choca con el bloqueo)', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas', { photo_quota: 1 });
    const first = await submit(g.token, photoPath(ev, g));
    const again = await submit(g.token, photoPath(ev, g));
    expect(again.rows[0].id).toBe(first.rows[0].id);
  });
});

describe('rutas con segmentos peligrosos', () => {
  const bad = [
    ['dos puntos como segmento', '../x.jpg'],
    ['dos puntos en medio', 'a/../x.jpg'],
    ['dos puntos para subir dos niveles', 'a/../../x.jpg'],
    ['punto como segmento', './x.jpg'],
    ['segmento vacío', 'a//x.jpg'],
    ['dos puntos al final', 'a/..'],
    ['barra invertida', 'a\\x.jpg'],
  ] as const;

  it.each(bad)('rechaza %s en la ruta de la foto y no gasta el cupo', async (_name, tail) => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas', { photo_quota: 2 });

    await expect(submit(g.token, `${ev.id}/${g.id}/${tail}`)).rejects.toMatchObject({ code: '22000' });
    const count = await db.query('select count(*)::int as n from photos where guest_id = $1', [g.id]);
    expect(count.rows[0].n).toBe(0);
  });

  it.each(bad)('rechaza %s en la ruta de la copia liviana', async (_name, tail) => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');

    await expect(
      submit(g.token, photoPath(ev, g), `${ev.id}/${g.id}/${tail}`),
    ).rejects.toMatchObject({ code: '22000' });
    const count = await db.query('select count(*)::int as n from photos where guest_id = $1', [g.id]);
    expect(count.rows[0].n).toBe(0);
  });

  it('las rutas normales siguen funcionando, con puntos dentro de un nombre', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');
    const ok = await submit(g.token, photoPath(ev, g, 'a.b.jpg'), photoPath(ev, g, 'a.b-display.jpg'));
    expect(ok.rows[0].storage_path).toBe(photoPath(ev, g, 'a.b.jpg'));
  });

  it('el prefijo equivocado sigue dando 22023 (no se confunde con la ruta peligrosa)', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');
    const h = await createGuest(db, ev.id, 'Beto Mora');
    await expect(submit(g.token, photoPath(ev, h))).rejects.toMatchObject({ code: '22023' });
  });
});
