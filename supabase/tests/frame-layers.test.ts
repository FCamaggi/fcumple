import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { validateLayers } from '../../src/lib/cameraAssets/layers';
import { asAnon, asUser, connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';

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

const insertCapas = (eventId: string, layers: unknown, label = 'Capas') =>
  db.query(`insert into event_frames (event_id, template, label, params) values ($1, 'capas', $2, $3) returning *`, [
    eventId,
    label,
    JSON.stringify({ layers }),
  ]);

const text = { type: 'text', text: 'Cumpleaños Fran', x: 0.5, y: 0.9, size: 0.08, font: 'display', color: '#ff4fa3' };
const rect = { type: 'shape', shape: 'rect', x: 0.5, y: 0.5, w: 0.5, h: 0.2, fill: '#111111' };

interface Case {
  name: string;
  layers: unknown;
  ok: boolean;
  /** Regla que solo puede aplicar la base (necesita el evento dueño del marco). */
  dbOnly?: boolean;
}

/** La misma tabla se prueba contra `validateLayers` (cliente) y contra la base: no se pueden desalinear. */
const cases = (e: string): Case[] => {
  const img = `${e}/frames/overlay.png`;
  const other = '123e4567-e89b-42d3-a456-426614174000';
  return [
    { name: 'lista vacía', layers: [], ok: true },
    {
      name: 'una capa de cada tipo',
      ok: true,
      layers: [
        text,
        rect,
        { type: 'shape', shape: 'ellipse', w: 0.2, h: 0.1, stroke: '#ffffff', strokeWidth: 0.01 },
        { type: 'shape', shape: 'line', w: 0.4, stroke: '#ffffff', strokeWidth: 0.01 },
        { type: 'shape', shape: 'path', w: 0.3, h: 0.3, d: 'M10 90 L50 10 L90 90 Z', fill: '#000000' },
        { type: 'image', src: img, w: 0.5, h: 0.5 },
        { type: 'image', src: img, full: true },
        { type: 'emoji', emoji: '🦇', size: 0.1, rotation: -15, opacity: 0.8, anchor: 'tl' },
        ...['anton', 'playfair', 'pacifico', 'marker', 'elite'].map((font) => ({ ...text, font })),
        { ...rect, shadow: { color: '#000000', blur: 0.02, x: 0.01, y: 0.01 } },
      ],
    },
    { name: 'no es una lista', layers: { type: 'text' }, ok: false },
    { name: 'capa que no es objeto', layers: ['hola'], ok: false },
    { name: 'tipo desconocido', layers: [{ type: 'script', text: 'x' }], ok: false },
    { name: 'tipo heredado de Object', layers: [{ type: 'constructor' }], ok: false },
    { name: 'clave desconocida', layers: [{ ...rect, onclick: 'alert(1)' }], ok: false },
    { name: 'clave de otro tipo de capa', layers: [{ ...rect, emoji: 'x' }], ok: false },
    { name: 'color sin #', layers: [{ ...rect, fill: 'red' }], ok: false },
    { name: 'texto vacío', layers: [{ ...text, text: '' }], ok: false },
    { name: 'texto solo espacios', layers: [{ ...text, text: '   ' }], ok: false },
    { name: 'texto de 61 caracteres', layers: [{ ...text, text: 'a'.repeat(61) }], ok: false },
    { name: 'tipografía fuera de la lista', layers: [{ ...text, font: 'comic-sans' }], ok: false },
    { name: 'tipografía en mayúsculas', layers: [{ ...text, font: 'Anton' }], ok: false },
    { name: 'tamaño de texto fuera de rango', layers: [{ ...text, size: 5 }], ok: false },
    { name: 'posición como texto', layers: [{ ...rect, x: '0.5' }], ok: false },
    { name: 'posición fuera de rango', layers: [{ ...rect, y: 9 }], ok: false },
    { name: 'rotación fuera de rango', layers: [{ ...rect, rotation: 720 }], ok: false },
    { name: 'opacidad mayor que 1', layers: [{ ...rect, opacity: 1.2 }], ok: false },
    { name: 'ancla desconocida', layers: [{ ...rect, anchor: 'middle' }], ok: false },
    { name: 'forma desconocida', layers: [{ type: 'shape', shape: 'star', w: 0.1, h: 0.1 }], ok: false },
    { name: 'path sin d', layers: [{ type: 'shape', shape: 'path', w: 0.1, h: 0.1 }], ok: false },
    { name: 'd en una forma que no es path', layers: [{ ...rect, d: 'M0 0' }], ok: false },
    { name: 'path con comando arco', layers: [{ type: 'shape', shape: 'path', w: 0.1, h: 0.1, d: 'M0 0 A5 5 0 0 1 10 10' }], ok: false },
    { name: 'path con notación científica', layers: [{ type: 'shape', shape: 'path', w: 0.1, h: 0.1, d: 'M1e9 0 L5 5' }], ok: false },
    { name: 'path en minúsculas', layers: [{ type: 'shape', shape: 'path', w: 0.1, h: 0.1, d: 'm0 0 l5 5' }], ok: false },
    { name: 'path demasiado largo', layers: [{ type: 'shape', shape: 'path', w: 0.1, h: 0.1, d: `M0 0${' L1 1'.repeat(200)}` }], ok: false },
    { name: 'imagen con URL', layers: [{ type: 'image', src: 'https://evil.example/x.png', w: 0.5, h: 0.5 }], ok: false },
    { name: 'imagen de la carpeta de stickers', layers: [{ type: 'image', src: `${e}/stickers/x.png`, w: 0.5, h: 0.5 }], ok: false },
    { name: 'imagen con ../', layers: [{ type: 'image', src: `${e}/frames/../x.png`, w: 0.5, h: 0.5 }], ok: false },
    { name: 'imagen sin tamaño ni full', layers: [{ type: 'image', src: img }], ok: false },
    { name: 'imagen full:false sin tamaño', layers: [{ type: 'image', src: img, full: false }], ok: false },
    { name: 'imagen de otro evento', layers: [{ type: 'image', src: `${other}/frames/x.png`, w: 0.5, h: 0.5 }], ok: false, dbOnly: true },
    { name: 'emoji vacío', layers: [{ type: 'emoji', emoji: '', size: 0.1 }], ok: false },
    { name: 'sombra con color inválido', layers: [{ ...rect, shadow: { color: 'black', blur: 0.01, x: 0, y: 0 } }], ok: false },
    { name: 'sombra incompleta', layers: [{ ...rect, shadow: { color: '#000000', blur: 0.01 } }], ok: false },
    { name: 'sombra con clave ajena', layers: [{ ...rect, shadow: { color: '#000000', blur: 0.01, x: 0, y: 0, extra: 1 } }], ok: false },
    { name: '40 capas', layers: Array.from({ length: 40 }, () => rect), ok: true },
    { name: '41 capas', layers: Array.from({ length: 41 }, () => rect), ok: false },
  ];
};

describe('capas: la base y el cliente aplican la misma regla', () => {
  it('cada caso da el mismo resultado en validateLayers y en la base', async () => {
    const ev = await newEvent();
    for (const c of cases(ev.id)) {
      if (!c.dbOnly) {
        expect(validateLayers(c.layers).ok, `cliente: ${c.name}`).toBe(c.ok);
      }
      const inserted = insertCapas(ev.id, c.layers, c.name);
      if (c.ok) await expect(inserted, `base: ${c.name}`).resolves.toBeDefined();
      else await expect(inserted, `base: ${c.name}`).rejects.toThrow(/event_frames_(params_valid|layers_valid)/);
    }
  });

  it('una imagen que apunta a la carpeta de OTRO evento se rechaza aunque el formato sea válido', async () => {
    const a = await newEvent();
    const b = await newEvent(bob);
    await expect(insertCapas(a.id, [{ type: 'image', src: `${b.id}/frames/x.png`, full: true }])).rejects.toThrow(/event_frames_layers_valid/);
    await expect(insertCapas(a.id, [{ type: 'image', src: `${a.id}/frames/x.png`, full: true }])).resolves.toBeDefined();
  });

  it('layers: null y un objeto en vez de lista se rechazan', async () => {
    const ev = await newEvent();
    for (const bad of ['null', '{"a":1}', '"x"', '5']) {
      await expect(
        db.query(`insert into event_frames (event_id, template, label, params) values ($1, 'capas', 'x', $2::jsonb)`, [ev.id, `{"layers":${bad}}`]),
      ).rejects.toThrow(/event_frames_(params_valid|layers_valid)/);
    }
  });
});

describe('plantilla capas', () => {
  it('acepta la plantilla, también sin capas, y sigue rechazando las desconocidas', async () => {
    const ev = await newEvent();
    await expect(db.query(`insert into event_frames (event_id, template, label) values ($1, 'capas', 'Vacío')`, [ev.id])).resolves.toBeDefined();
    await expect(db.query(`insert into event_frames (event_id, template, label) values ($1, 'hacker', 'x')`, [ev.id])).rejects.toThrow(/check/);
  });

  it('las capas solo valen en la plantilla capas', async () => {
    const ev = await newEvent();
    await expect(
      db.query(`insert into event_frames (event_id, template, label, params) values ($1, 'border', 'x', $2)`, [ev.id, JSON.stringify({ layers: [] })]),
    ).rejects.toThrow(/event_frames_layers_only_capas/);
  });

  it('el tope sube a 16 KB solo con capas: sin ellas sigue en 2 KB', async () => {
    const ev = await newEvent();
    const path = { type: 'shape', shape: 'path', w: 0.3, h: 0.3, d: `M0 0${' L10 10'.repeat(80)}`, fill: '#000000' };
    const layers = Array.from({ length: 24 }, () => path);
    expect(JSON.stringify({ layers }).length).toBeGreaterThan(2048);
    expect(JSON.stringify({ layers }).length).toBeLessThanOrEqual(16384);
    await expect(insertCapas(ev.id, layers)).resolves.toBeDefined();

    await expect(
      db.query(`insert into event_frames (event_id, template, label, params) values ($1, 'border', 'x', $2)`, [
        ev.id,
        JSON.stringify({ title: 'a', primaryColor: '#000000', extra: 'x'.repeat(2100) }),
      ]),
    ).rejects.toThrow(/event_frames_params_valid/);
  });

  it('todo lo que acepta el cliente cabe en el tope de la base (el cliente rechaza siempre antes)', async () => {
    const ev = await newEvent();
    const path = { type: 'shape', shape: 'path', w: 0.3, h: 0.3, d: `M0 0${' L10 10'.repeat(80)}`, fill: '#000000', stroke: '#ffffff', strokeWidth: 0.01 };
    // Justo bajo los 16384 caracteres compactos del cliente.
    const layers = Array.from({ length: 22 }, () => path);
    expect(JSON.stringify({ layers }).length).toBeLessThanOrEqual(16384);
    const { rows } = await insertCapas(ev.id, layers);
    expect(Buffer.byteLength(JSON.stringify(rows[0].params))).toBeLessThan(32768);
  });

  it('el organizador crea marcos de capas en su evento y no en el de otro', async () => {
    const a = await newEvent();
    const b = await newEvent(bob);
    const create = (eventId: string) =>
      asUser(db, alice, () =>
        db.query(`insert into event_frames (event_id, template, label, params) values ($1, 'capas', 'x', $2)`, [eventId, JSON.stringify({ layers: [rect] })]),
      );
    await expect(create(a.id)).resolves.toBeDefined();
    await expect(create(b.id)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('list_event_camera_assets con capas', () => {
  it('el invitado recibe el marco de capas con sus capas', async () => {
    const ev = await newEvent();
    const guest = await createGuest(db, ev.id, 'Ana Rojas');
    await insertCapas(ev.id, [text, rect], 'Cumpleaños Fran');
    const all = await asAnon(db, () => db.query('select * from list_event_camera_assets($1)', [guest.token]));
    const rows = all.rows.filter((r) => r.asset_type === 'frame');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ asset_type: 'frame', template: 'capas', label: 'Cumpleaños Fran' });
    expect(rows[0].params.layers).toHaveLength(2);
  });
});

describe('Storage: imágenes de las capas', () => {
  const readObject = (name: string) =>
    db.query(`select name from storage.objects where bucket_id = 'event-assets' and name = $1`, [name]);
  const putObject = (name: string) => db.query(`insert into storage.objects (bucket_id, name) values ('event-assets', $1)`, [name]);

  it('un invitado lee la imagen de un marco activo y deja de poder cuando se apaga el marco o los marcos del evento', async () => {
    const ev = await newEvent();
    const path = `${ev.id}/frames/overlay.png`;
    await putObject(path);
    const frame = (await insertCapas(ev.id, [{ type: 'image', src: path, full: true }])).rows[0];

    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(1);

    await db.query('update event_frames set enabled = false where id = $1', [frame.id]);
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(0);

    await db.query('update event_frames set enabled = true where id = $1', [frame.id]);
    await db.query('update events set frames_enabled = false where id = $1', [ev.id]);
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(0);
  });

  it('un archivo de frames/ que ningún marco usa no se puede leer', async () => {
    const ev = await newEvent();
    const path = `${ev.id}/frames/suelto.png`;
    await putObject(path);
    await insertCapas(ev.id, [rect]);
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(0);
  });

  it('los stickers siguen funcionando igual', async () => {
    const ev = await newEvent();
    const path = `${ev.id}/stickers/a.webp`;
    await putObject(path);
    await db.query(`insert into event_stickers (event_id, kind, storage_path) values ($1, 'image', $2)`, [ev.id, path]);
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(1);
  });

  it('el organizador sube a frames/ de su evento y no a la de otro; el invitado no sube', async () => {
    const a = await createEvent(db, alice);
    const b = await createEvent(db, bob);
    await expect(asUser(db, alice, () => putObject(`${a.id}/frames/x.png`))).resolves.toBeDefined();
    await expect(asUser(db, alice, () => putObject(`${b.id}/frames/x.png`))).rejects.toMatchObject({ code: '42501' });
    await expect(asAnon(db, () => putObject(`${a.id}/frames/y.png`))).rejects.toMatchObject({ code: '42501' });
  });
});
