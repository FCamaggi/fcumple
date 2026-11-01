import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { validateFrameParams } from '../../src/lib/cameraAssets/frames';
import { asAnon, connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';

let db: Client;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
  alice = await createUser(db, 'alice@example.com');
  bob = await createUser(db, 'bob@example.com');
});

afterAll(async () => {
  await db.end();
});

async function newEvent(owner = alice) {
  const ev = await createEvent(db, owner);
  await db.query('delete from event_frames where event_id = $1', [ev.id]);
  return ev;
}

const insertParams = (eventId: string, params: unknown, label = 'Variantes') =>
  db.query(`insert into event_frames (event_id, template, label, params) values ($1, 'capas', $2, $3) returning *`, [
    eventId,
    label,
    JSON.stringify(params),
  ]);

const text = { type: 'text', text: 'Cumpleaños Martina', x: 0.5, y: 0.9, size: 0.08, font: 'display', color: '#ff4fa3' };
const rect = { type: 'shape', shape: 'rect', x: 0.5, y: 0.5, w: 0.5, h: 0.2, fill: '#111111' };
const path = { type: 'shape', shape: 'path', w: 0.3, h: 0.3, d: `M0 0${' L10 10'.repeat(80)}`, fill: '#000000' };

interface Case {
  name: string;
  params: unknown;
  ok: boolean;
  /** Regla que solo puede aplicar la base (necesita el evento dueño del marco). */
  dbOnly?: boolean;
}

/** La misma tabla se prueba contra `validateFrameParams` (cliente) y contra la base: no se pueden desalinear. */
const cases = (e: string): Case[] => [
  { name: 'variants vacío', params: { variants: {} }, ok: true },
  { name: 'una variante vacía', params: { variants: { '3:4': { layers: [] } } }, ok: true },
  {
    name: 'las cuatro variantes y layers de compatibilidad',
    params: {
      layers: [rect],
      variants: { '3:4': { layers: [rect] }, '4:3': { layers: [text] }, '1:1': { layers: [] }, '9:16': { layers: [rect, text] } },
    },
    ok: true,
  },
  { name: '40 capas en una variante', params: { variants: { '3:4': { layers: Array.from({ length: 40 }, () => rect) } } }, ok: true },
  { name: '41 capas en una variante', params: { variants: { '3:4': { layers: Array.from({ length: 41 }, () => rect) } } }, ok: false },
  {
    name: '40 capas en dos variantes (el tope es por variante)',
    params: { variants: { '3:4': { layers: Array.from({ length: 40 }, () => rect) }, '1:1': { layers: Array.from({ length: 40 }, () => rect) } } },
    ok: true,
  },
  { name: 'proporción desconocida', params: { variants: { '16:9': { layers: [] } } }, ok: false },
  { name: 'variante sin layers', params: { variants: { '3:4': {} } }, ok: false },
  { name: 'variante con clave ajena', params: { variants: { '3:4': { layers: [], extra: 1 } } }, ok: false },
  { name: 'variante que es lista', params: { variants: { '3:4': [] } }, ok: false },
  { name: 'layers de la variante que no es lista', params: { variants: { '3:4': { layers: 'x' } } }, ok: false },
  { name: 'capa inválida dentro de una variante', params: { variants: { '3:4': { layers: [{ ...rect, fill: 'red' }] } } }, ok: false },
  { name: 'variants que es lista', params: { variants: [] }, ok: false },
  { name: 'variants que es texto', params: { variants: 'x' }, ok: false },
  { name: 'variants null', params: { variants: null }, ok: false },
  {
    name: 'imagen del propio evento en una variante',
    params: { variants: { '1:1': { layers: [{ type: 'image', src: `${e}/frames/x.png`, full: true }] } } },
    ok: true,
  },
  {
    name: 'imagen de OTRO evento en una variante',
    params: { variants: { '1:1': { layers: [{ type: 'image', src: '123e4567-e89b-42d3-a456-426614174000/frames/x.png', full: true }] } } },
    ok: false,
    dbOnly: true,
  },
];

describe('variantes: la base y el cliente aplican la misma regla', () => {
  it('cada caso da el mismo resultado en validateFrameParams y en la base', async () => {
    const ev = await newEvent();
    for (const c of cases(ev.id)) {
      if (!c.dbOnly) expect(validateFrameParams(c.params).ok, `cliente: ${c.name}`).toBe(c.ok);
      const inserted = insertParams(ev.id, c.params, c.name);
      if (c.ok) await expect(inserted, `base: ${c.name}`).resolves.toBeDefined();
      else await expect(inserted, `base: ${c.name}`).rejects.toThrow(/event_frames_(params_valid|layers_valid)/);
    }
  });

  it('una imagen de OTRO evento se rechaza en una variante y también en layers cuando hay variantes', async () => {
    const a = await newEvent();
    const b = await newEvent(bob);
    const foreign = { type: 'image', src: `${b.id}/frames/x.png`, full: true };
    await expect(insertParams(a.id, { variants: { '3:4': { layers: [foreign] } } })).rejects.toThrow(/event_frames_layers_valid/);
    await expect(insertParams(a.id, { layers: [foreign], variants: { '3:4': { layers: [] } } })).rejects.toThrow(/event_frames_layers_valid/);
  });

  it('el tope total sube a 128 KB solo con variants; cada variante conserva 32 KB', async () => {
    const ev = await newEvent();
    const variantOf = (n: number) => ({ layers: Array.from({ length: n }, () => path) });
    const three = { variants: { '3:4': variantOf(24), '4:3': variantOf(24), '1:1': variantOf(24) } };
    expect(JSON.stringify(three).length).toBeGreaterThan(32768);
    await expect(insertParams(ev.id, three)).resolves.toBeDefined();

    // Más de 128 KB en total se rechaza aunque cada variante (y layers) quepa en sus 32 KB.
    const heavy = { ...path, stroke: '#ffffff', strokeWidth: 0.01 };
    const full = () => ({ layers: Array.from({ length: 40 }, () => heavy) });
    const over = {
      layers: full().layers,
      variants: { '3:4': full(), '4:3': full(), '1:1': full(), '9:16': full() },
    };
    expect(Buffer.byteLength(JSON.stringify(over))).toBeGreaterThan(131072);
    await expect(insertParams(ev.id, over)).rejects.toThrow(/event_frames_(params_valid|layers_valid)/);
  });

  it('todo lo que acepta el cliente cabe en el tope de la base (el cliente rechaza siempre antes)', async () => {
    const ev = await newEvent();
    const heavy = { ...path, stroke: '#ffffff', strokeWidth: 0.01 };
    const variantOf = () => ({ layers: Array.from({ length: 22 }, () => heavy) });
    const params = {
      layers: variantOf().layers,
      variants: { '3:4': variantOf(), '4:3': variantOf(), '1:1': variantOf() },
    };
    expect(JSON.stringify(params).length).toBeLessThanOrEqual(65536);
    expect(validateFrameParams(params).ok).toBe(true);
    const { rows } = await insertParams(ev.id, params);
    expect(Buffer.byteLength(JSON.stringify(rows[0].params))).toBeLessThan(131072);
  });
});

describe('list_event_camera_assets con variantes', () => {
  it('el invitado recibe el marco con sus variantes', async () => {
    const ev = await newEvent();
    const guest = await createGuest(db, ev.id, 'Ana Rojas');
    const params = { layers: [rect], variants: { '3:4': { layers: [rect] }, '1:1': { layers: [text] } } };
    await insertParams(ev.id, params, 'Con variantes');
    const all = await asAnon(db, () => db.query('select * from list_event_camera_assets($1)', [guest.token]));
    const rows = all.rows.filter((r) => r.asset_type === 'frame');
    expect(rows).toHaveLength(1);
    expect(rows[0].params).toEqual(params);
  });
});

describe('Storage: imágenes que solo están en una variante', () => {
  const readObject = (name: string) =>
    db.query(`select name from storage.objects where bucket_id = 'event-assets' and name = $1`, [name]);
  const putObject = (name: string) => db.query(`insert into storage.objects (bucket_id, name) values ('event-assets', $1)`, [name]);

  it('un invitado lee la imagen de una variante de un marco activo, y deja de poder si se apaga el marco o los marcos del evento', async () => {
    const ev = await newEvent();
    const path = `${ev.id}/frames/solo-9x16.png`;
    await putObject(path);
    const image = { type: 'image', src: path, full: true };
    // La imagen no está en layers (el espejo de 3:4): solo en la variante 9:16.
    const frame = (await insertParams(ev.id, { layers: [rect], variants: { '3:4': { layers: [rect] }, '9:16': { layers: [image] } } })).rows[0];

    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(1);

    await db.query('update event_frames set enabled = false where id = $1', [frame.id]);
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(0);

    await db.query('update event_frames set enabled = true where id = $1', [frame.id]);
    await db.query('update events set frames_enabled = false where id = $1', [ev.id]);
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(0);
  });

  it('un archivo de frames/ que ninguna variante ni layers usa no se puede leer', async () => {
    const ev = await newEvent();
    const path = `${ev.id}/frames/suelto.png`;
    await putObject(path);
    await insertParams(ev.id, { layers: [rect], variants: { '1:1': { layers: [rect] } } });
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(0);
  });

  it('la imagen de un marco de antes (solo layers) sigue siendo legible', async () => {
    const ev = await newEvent();
    const path = `${ev.id}/frames/antiguo.png`;
    await putObject(path);
    await insertParams(ev.id, { layers: [{ type: 'image', src: path, full: true }] });
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(1);
  });
});

describe('migración: los marcos de antes reciben una variante por proporción', () => {
  const migration = () => {
    const dir = join(__dirname, '..', 'migrations');
    const file = readdirSync(dir).find((f) => f.endsWith('_frame_variants.sql'));
    if (!file) throw new Error('Falta la migración *_frame_variants.sql');
    return readFileSync(join(dir, file), 'utf8');
  };
  const read = async (id: string) => (await db.query('select params from event_frames where id = $1', [id])).rows[0].params;

  it('copia layers a las cuatro proporciones, conserva layers y no toca lo que ya tiene variantes', async () => {
    const ev = await newEvent();
    const legacy = await db.query(
      `insert into event_frames (event_id, template, label, params) values ($1, 'capas', 'Antiguo', $2) returning id`,
      [ev.id, JSON.stringify({ title: 'Hola', layers: [rect, text] })],
    );
    const empty = await db.query(`insert into event_frames (event_id, template, label) values ($1, 'capas', 'Sin params') returning id`, [ev.id]);
    const withVariants = await insertParams(ev.id, { layers: [rect], variants: { '1:1': { layers: [text] } } }, 'Ya migrado');

    await db.query(migration());

    const migrated = await read(legacy.rows[0].id);
    expect(migrated.layers).toEqual([rect, text]);
    expect(migrated.title).toBe('Hola');
    expect(Object.keys(migrated.variants).sort()).toEqual(['1:1', '3:4', '4:3', '9:16']);
    for (const ratio of Object.keys(migrated.variants)) expect(migrated.variants[ratio]).toEqual({ layers: [rect, text] });
    expect(validateFrameParams(migrated).ok).toBe(true);

    expect(await read(empty.rows[0].id)).toEqual({});
    expect((await read(withVariants.rows[0].id)).variants).toEqual({ '1:1': { layers: [text] } });
  });

  it('es idempotente: aplicarla dos veces deja lo mismo', async () => {
    const ev = await newEvent();
    const { rows } = await db.query(
      `insert into event_frames (event_id, template, label, params) values ($1, 'capas', 'Antiguo', $2) returning id`,
      [ev.id, JSON.stringify({ layers: [rect] })],
    );
    await db.query(migration());
    const first = await read(rows[0].id);
    await db.query(migration());
    expect(await read(rows[0].id)).toEqual(first);
  });

  it('no copia si el resultado pasaría de 64 KB: deja el marco con solo layers', async () => {
    const ev = await newEvent();
    const heavy = { ...path, stroke: '#ffffff', strokeWidth: 0.01 };
    const layers = Array.from({ length: 24 }, () => heavy);
    const { rows } = await db.query(
      `insert into event_frames (event_id, template, label, params) values ($1, 'capas', 'Pesado', $2) returning id`,
      [ev.id, JSON.stringify({ layers })],
    );
    await db.query(migration());
    const params = await read(rows[0].id);
    expect(params.variants).toBeUndefined();
    expect(params.layers).toHaveLength(24);
  });
});
