import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asAnon, asUser, connect, createEvent, createUser, resetAndMigrate } from './helpers';
import { resolveWishlist, serializeWishlist } from '../../src/lib/wishlist';

let db: Client;
let owner: string;
let other: string;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
  owner = await createUser(db, 'organizadora@example.com');
  other = await createUser(db, 'otra@example.com');
});

afterAll(async () => {
  await db.end();
});

describe('wishlist / lista de regalos en la base de datos', () => {
  it('un evento nuevo arranca con wishlist desactivada y lista vacía', async () => {
    const created = await asUser(db, owner, () => db.query(`select * from create_event('Fiesta Wishlist')`));
    expect(created.rows[0].wishlist).toEqual({
      enabled: false,
      display_mode: 'chip',
      items: [],
    });
  });

  it('valida la estructura jsonb mediante valid_event_wishlist', async () => {
    const valid = {
      enabled: true,
      display_mode: 'chip',
      title: 'Lista de cumple',
      items: [
        {
          id: 'item-1',
          url: 'https://paris.cl/camara',
          title: 'Cámara instantánea',
          image_url: 'https://paris.cl/img.jpg',
          price: '$79.990',
          notes: 'Color rosado si hay',
        },
      ],
    };
    const { rows } = await db.query<{ ok: boolean }>('select valid_event_wishlist($1::jsonb) as ok', [
      JSON.stringify(valid),
    ]);
    expect(rows[0].ok).toBe(true);

    // Rechaza URL no http/https
    const badUrl = { ...valid, items: [{ ...valid.items[0], url: 'javascript:alert(1)' }] };
    const resBadUrl = await db.query<{ ok: boolean }>('select valid_event_wishlist($1::jsonb) as ok', [
      JSON.stringify(badUrl),
    ]);
    expect(resBadUrl.rows[0].ok).toBe(false);

    // Rechaza display_mode desconocido
    const badMode = { ...valid, display_mode: 'floating' };
    const resBadMode = await db.query<{ ok: boolean }>('select valid_event_wishlist($1::jsonb) as ok', [
      JSON.stringify(badMode),
    ]);
    expect(resBadMode.rows[0].ok).toBe(false);

    // Rechaza más de 30 items
    const manyItems = {
      ...valid,
      items: Array.from({ length: 31 }, (_, i) => ({
        id: `item-${i}`,
        url: 'https://example.com/regalo',
        title: `Regalo ${i}`,
      })),
    };
    const resMany = await db.query<{ ok: boolean }>('select valid_event_wishlist($1::jsonb) as ok', [
      JSON.stringify(manyItems),
    ]);
    expect(resMany.rows[0].ok).toBe(false);
  });

  it('el organizador puede actualizar la wishlist pero un tercero no', async () => {
    const ev = await createEvent(db, owner, { name: 'Cumple Martina' });

    const newWishlist = {
      enabled: true,
      display_mode: 'card',
      title: 'Deseos de Martina',
      items: [
        {
          id: 'w-1',
          url: 'https://amazon.com/dp/B001',
          title: 'Libro de fotos',
        },
      ],
    };

    // Owner actualiza
    await asUser(db, owner, () =>
      db.query('update events set wishlist = $1 where id = $2', [JSON.stringify(newWishlist), ev.id]),
    );

    const check = await asUser(db, owner, () => db.query('select wishlist from events where id = $1', [ev.id]));
    expect(check.rows[0].wishlist).toEqual(newWishlist);

    // Otro usuario no puede modificar el evento
    const otherUpdate = await asUser(db, other, () =>
      db.query('update events set wishlist = $1 where id = $2', [
        JSON.stringify({ enabled: false, display_mode: 'chip', items: [] }),
        ev.id,
      ]),
    );
    expect(otherUpdate.rowCount).toBe(0);
  });

  it('get_event_public incluye el campo wishlist para el invitado', async () => {
    const ev = await createEvent(db, owner, { name: 'Noche de Disfraces' });
    const pub = await asAnon(db, () => db.query('select * from get_event_public($1)', [ev.slug]));
    expect(pub.rows[0].wishlist).toEqual({
      enabled: false,
      display_mode: 'chip',
      items: [],
    });
  });

  describe('festejados (varios dueños)', () => {
    const isValid = async (w: unknown) =>
      (await db.query<{ ok: boolean }>('select valid_event_wishlist($1::jsonb) as ok', [JSON.stringify(w)])).rows[0].ok;

    const base = {
      enabled: true,
      display_mode: 'chip',
      honorees: [
        { id: 'h1', name: 'Nacho' },
        { id: 'h2', name: 'Grazia' },
      ],
      items: [
        { id: 'a', url: 'https://x.cl/a', title: 'Patineta', honoree_ids: ['h1'] },
        { id: 'b', url: 'https://x.cl/b', title: 'Juego de mesa' },
      ],
    };

    it('acepta festejados y regalos asignados a ellos', async () => {
      expect(await isValid(base)).toBe(true);
    });

    it('rechaza un regalo asignado a un festejado que no existe o repetido', async () => {
      expect(await isValid({ ...base, items: [{ ...base.items[0], honoree_ids: ['h9'] }] })).toBe(false);
      expect(await isValid({ ...base, items: [{ ...base.items[0], honoree_ids: ['h1', 'h1'] }] })).toBe(false);
      const { honorees: _h, ...sinFestejados } = base;
      expect(await isValid(sinFestejados)).toBe(false);
    });

    it('rechaza festejados mal formados', async () => {
      expect(await isValid({ ...base, honorees: [{ id: 'h1', name: '  ' }] , items: [] })).toBe(false);
      expect(await isValid({ ...base, honorees: [{ id: 'h1', name: 'A' }, { id: 'h1', name: 'B' }], items: [] })).toBe(false);
      expect(await isValid({ ...base, honorees: [{ id: 'h1', name: 'A', email: 'x' }], items: [] })).toBe(false);
      const siete = Array.from({ length: 7 }, (_, i) => ({ id: `h${i}`, name: `P${i}` }));
      expect(await isValid({ ...base, honorees: siete, items: [] })).toBe(false);
    });

    it('lo que escribe el panel (serializeWishlist) pasa la validación de la base', async () => {
      const config = resolveWishlist({
        ...base,
        display_mode: 'card',
        title: 'Regalos',
        items: [
          { id: 'a', url: 'https://x.cl/a', title: 'Patineta', image_url: 'https://x.cl/a.jpg', honoree_ids: ['h1', 'h2'] },
          { id: 'b', url: 'https://x.cl/b', title: 'Pinturas', price: '$5.000', notes: 'Acuarela' },
        ],
      });
      expect(await isValid(serializeWishlist(config))).toBe(true);
      expect(await isValid(serializeWishlist(resolveWishlist(null)))).toBe(true);
    });
  });
});
