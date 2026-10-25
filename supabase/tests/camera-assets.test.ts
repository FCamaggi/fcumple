import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
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

const insertFrame = (eventId: string, params: unknown, template = 'capas', label = 'Marco') =>
  db.query('insert into event_frames (event_id, template, label, params) values ($1, $2, $3, $4) returning *', [
    eventId,
    template,
    label,
    JSON.stringify(params),
  ]);

async function newEvent(owner = alice) {
  const ev = await createEvent(db, owner);
  // Se parte sin los ejemplos del trigger para controlar el contenido.
  await db.query('delete from event_frames where event_id = $1', [ev.id]);
  await db.query('delete from event_stickers where event_id = $1', [ev.id]);
  return ev;
}

describe('ejemplos al crear un evento', () => {
  it('un evento nuevo trae 1 marco de capas y 6 emojis de ejemplo, activos y validos', async () => {
    const ev = await createEvent(db, alice, { name: 'Cumple de Ana' });
    const frames = await db.query('select template, enabled, params from event_frames where event_id = $1 order by sort_order', [ev.id]);
    expect(frames.rows.map((r) => r.template)).toEqual(['capas']);
    expect(frames.rows.every((r) => r.enabled)).toBe(true);
    expect(frames.rows[0].params.layers[0]).toMatchObject({ type: 'text', text: 'Cumple de Ana' });

    const stickers = await db.query('select kind, emoji from event_stickers where event_id = $1 order by sort_order', [ev.id]);
    expect(stickers.rows).toHaveLength(6);
    expect(stickers.rows.every((r) => r.kind === 'emoji' && r.emoji)).toBe(true);
  });

  it('un nombre de evento muy largo no rompe los ejemplos (se recorta a 60)', async () => {
    const ev = await createEvent(db, alice, { name: 'x'.repeat(120) });
    const frame = await db.query(`select params from event_frames where event_id = $1 and template = 'capas'`, [ev.id]);
    expect(frame.rows[0].params.layers[0].text).toHaveLength(60);
  });
});

describe('validacion de los parametros de un marco', () => {
  it('acepta parametros validos, incluido {}', async () => {
    const ev = await newEvent();
    await expect(insertFrame(ev.id, {})).resolves.toBeDefined();
    await expect(
      insertFrame(ev.id, {
        primaryColor: '#FF00aa',
        secondaryColor: '#000000',
        textColor: '#ffffff',
        title: 'Hola',
        subtitle: 'Mundo',
        caption: 'Pie',
        font: 'hand',
        thickness: 0.5,
        radius: 0,
        position: 'top',
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['color sin #', { primaryColor: 'ff0000' }],
    ['color con nombre', { primaryColor: 'red' }],
    ['color de 3 digitos', { textColor: '#fff' }],
    ['texto de 61 caracteres', { title: 'a'.repeat(61) }],
    ['texto que no es string', { caption: 12 }],
    ['fuente desconocida', { font: 'comic-sans' }],
    ['grosor fuera de rango', { thickness: 1.5 }],
    ['radio negativo', { radius: -0.1 }],
    ['posicion invalida', { position: 'left' }],
    ['clave desconocida', { script: '<script>alert(1)</script>' }],
    ['demasiado grande', { title: 'a'.repeat(60), subtitle: 'b'.repeat(60), caption: 'c'.repeat(60), primaryColor: '#000000', extra: 'x'.repeat(2100) }],
  ])('rechaza %s', async (_name, params) => {
    const ev = await newEvent();
    await expect(insertFrame(ev.id, params)).rejects.toThrow(/event_frames_params_valid/);
  });

  it('rechaza params que no es un objeto', async () => {
    const ev = await newEvent();
    await expect(
      db.query(`insert into event_frames (event_id, template, label, params) values ($1, 'capas', 'x', '[1,2]')`, [ev.id]),
    ).rejects.toThrow(/event_frames_params_valid/);
  });

  it('rechaza una plantilla desconocida y una etiqueta vacia', async () => {
    const ev = await newEvent();
    await expect(insertFrame(ev.id, {}, 'hacker')).rejects.toThrow(/check/);
    await expect(insertFrame(ev.id, {}, 'capas', '   ')).rejects.toThrow(/check/);
  });
});

describe('stickers: consistencia y topes', () => {
  it('un emoji lleva texto y no ruta; una imagen lleva ruta y no emoji', async () => {
    const ev = await newEvent();
    await expect(db.query(`insert into event_stickers (event_id, kind, emoji) values ($1, 'emoji', U&'\\+01F389')`, [ev.id])).resolves.toBeDefined();
    await expect(
      db.query(`insert into event_stickers (event_id, kind, storage_path) values ($1, 'image', $2)`, [ev.id, `${ev.id}/stickers/a.webp`]),
    ).resolves.toBeDefined();

    await expect(db.query(`insert into event_stickers (event_id, kind) values ($1, 'emoji')`, [ev.id])).rejects.toThrow(/event_stickers_kind_data/);
    await expect(
      db.query(`insert into event_stickers (event_id, kind, emoji, storage_path) values ($1, 'emoji', 'x', 'y')`, [ev.id]),
    ).rejects.toThrow(/event_stickers_kind_data/);
    await expect(db.query(`insert into event_stickers (event_id, kind) values ($1, 'image')`, [ev.id])).rejects.toThrow(/event_stickers_kind_data/);
  });

  it('la imagen de un sticker no puede apuntar a la carpeta de otro evento', async () => {
    const a = await newEvent();
    const b = await newEvent(bob);
    await expect(
      db.query(`insert into event_stickers (event_id, kind, storage_path) values ($1, 'image', $2)`, [a.id, `${b.id}/stickers/a.webp`]),
    ).rejects.toThrow(/event_stickers_path_in_event/);
    await expect(
      db.query(`insert into event_stickers (event_id, kind, storage_path) values ($1, 'image', $2)`, [a.id, `${a.id}/otra/a.webp`]),
    ).rejects.toThrow(/event_stickers_path_in_event/);
  });

  it('tope de 20 marcos y 40 stickers por evento', async () => {
    const ev = await newEvent();
    for (let i = 0; i < 20; i++) await insertFrame(ev.id, {}, 'capas', `Marco ${i}`);
    await expect(insertFrame(ev.id, {})).rejects.toMatchObject({ code: '53400' });

    for (let i = 0; i < 40; i++) {
      await db.query(`insert into event_stickers (event_id, kind, emoji) values ($1, 'emoji', 'a')`, [ev.id]);
    }
    await expect(db.query(`insert into event_stickers (event_id, kind, emoji) values ($1, 'emoji', 'a')`, [ev.id])).rejects.toMatchObject({
      code: '53400',
    });

    // El tope es por evento.
    const other = await newEvent();
    await expect(insertFrame(other.id, {})).resolves.toBeDefined();
  });
});

describe('marco por defecto', () => {
  it('tiene que ser un marco del mismo evento', async () => {
    const a = await newEvent();
    const b = await newEvent(bob);
    const frameB = (await insertFrame(b.id, {})).rows[0];
    await expect(db.query('update events set default_frame_id = $1 where id = $2', [frameB.id, a.id])).rejects.toThrow(/events_default_frame_fk/);

    const frameA = (await insertFrame(a.id, {})).rows[0];
    await expect(db.query('update events set default_frame_id = $1 where id = $2', [frameA.id, a.id])).resolves.toBeDefined();
  });

  it('al borrar el marco por defecto, el evento sigue existiendo y queda sin marco por defecto', async () => {
    const ev = await newEvent();
    const frame = (await insertFrame(ev.id, {})).rows[0];
    await db.query('update events set default_frame_id = $1 where id = $2', [frame.id, ev.id]);
    await db.query('delete from event_frames where id = $1', [frame.id]);
    const { rows } = await db.query('select id, default_frame_id from events where id = $1', [ev.id]);
    expect(rows).toEqual([{ id: ev.id, default_frame_id: null }]);
  });
});

describe('RLS: solo el organizador escribe, y solo en lo suyo', () => {
  it('un organizador no ve ni toca los marcos y stickers de otro', async () => {
    const a = await createEvent(db, alice);
    const b = await createEvent(db, bob);

    const frames = await asUser(db, alice, () => db.query('select event_id from event_frames'));
    expect(frames.rows.some((r) => r.event_id === a.id)).toBe(true);
    expect(frames.rows.some((r) => r.event_id === b.id)).toBe(false);
    const stickersSeen = await asUser(db, alice, () => db.query('select event_id from event_stickers'));
    expect(stickersSeen.rows.some((r) => r.event_id === b.id)).toBe(false);

    await expect(
      asUser(db, alice, () => db.query(`insert into event_frames (event_id, template, label) values ($1, 'capas', 'x')`, [b.id])),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asUser(db, alice, () => db.query(`insert into event_stickers (event_id, kind, emoji) values ($1, 'emoji', 'a')`, [b.id])),
    ).rejects.toMatchObject({ code: '42501' });

    const upd = await asUser(db, alice, () => db.query(`update event_frames set enabled = false where event_id = $1`, [b.id]));
    expect(upd.rowCount).toBe(0);
  });

  it('el organizador crea, edita y borra lo suyo', async () => {
    const ev = await newEvent();
    const created = await asUser(db, alice, () =>
      db.query(`insert into event_frames (event_id, template, label, params) values ($1, 'capas', 'Brillo', '{"layers":[]}') returning id`, [ev.id]),
    );
    const id = created.rows[0].id;
    await asUser(db, alice, () => db.query(`update event_frames set enabled = false where id = $1`, [id]));
    const del = await asUser(db, alice, () => db.query('delete from event_frames where id = $1', [id]));
    expect(del.rowCount).toBe(1);
  });

  it('anon no tiene acceso directo a las tablas', async () => {
    for (const table of ['event_frames', 'event_stickers']) {
      await expect(asAnon(db, () => db.query(`select * from ${table}`))).rejects.toMatchObject({ code: '42501' });
    }
  });
});

describe('list_event_camera_assets', () => {
  const list = (token: string) => asAnon(db, () => db.query('select * from list_event_camera_assets($1)', [token]));

  it('entrega solo lo activo de SU evento, ordenado, con el marco por defecto marcado', async () => {
    const ev = await newEvent();
    const other = await newEvent(bob);
    const guest = await createGuest(db, ev.id, 'Ana Rojas');

    const first = (await insertFrame(ev.id, { layers: [] }, 'capas', 'Primero')).rows[0];
    await insertFrame(ev.id, {}, 'capas', 'Apagado').then((r) => db.query('update event_frames set enabled = false where id = $1', [r.rows[0].id]));
    await insertFrame(other.id, {}, 'capas', 'Ajeno');
    await db.query('update events set default_frame_id = $1 where id = $2', [first.id, ev.id]);
    await db.query(`insert into event_stickers (event_id, kind, emoji, sort_order) values ($1, 'emoji', 'b', 2), ($1, 'emoji', 'a', 1)`, [ev.id]);
    await db.query(`insert into event_stickers (event_id, kind, emoji, enabled) values ($1, 'emoji', 'z', false)`, [ev.id]);
    await db.query(`insert into event_stickers (event_id, kind, emoji) values ($1, 'emoji', 'ajeno')`, [other.id]);

    const { rows } = await list(guest.token);
    const frames = rows.filter((r) => r.asset_type === 'frame');
    const stickers = rows.filter((r) => r.asset_type === 'sticker');

    expect(frames.map((f) => f.label)).toEqual(['Primero']);
    expect(frames[0]).toMatchObject({ template: 'capas', is_default: true, params: { layers: [] } });
    expect(stickers.map((s) => s.emoji)).toEqual(['a', 'b']);
  });

  it('los interruptores globales ocultan todos los marcos o todos los stickers', async () => {
    const ev = await newEvent();
    const guest = await createGuest(db, ev.id, 'Ana Rojas');
    await insertFrame(ev.id, {});
    await db.query(`insert into event_stickers (event_id, kind, emoji) values ($1, 'emoji', 'a')`, [ev.id]);

    await db.query('update events set frames_enabled = false where id = $1', [ev.id]);
    expect((await list(guest.token)).rows.map((r) => r.asset_type)).toEqual(['sticker']);

    await db.query('update events set frames_enabled = true, stickers_enabled = false where id = $1', [ev.id]);
    expect((await list(guest.token)).rows.map((r) => r.asset_type)).toEqual(['frame']);
  });

  it('un token inexistente o un invitado pendiente no recibe nada', async () => {
    const ev = await newEvent();
    await insertFrame(ev.id, {});
    const pending = await createGuest(db, ev.id, 'Pedro Pascal', { approval_status: 'pending' });
    expect((await list('token-falso')).rows).toEqual([]);
    expect((await list(pending.token)).rows).toEqual([]);
  });
});

describe('Storage: imagenes de stickers', () => {
  const insertObject = (name: string) =>
    db.query(`insert into storage.objects (bucket_id, name) values ('event-assets', $1)`, [name]);
  const readObject = (name: string) =>
    db.query(`select name from storage.objects where bucket_id = 'event-assets' and name = $1`, [name]);

  it('el organizador sube a la carpeta de su evento y no a la de otro', async () => {
    const a = await createEvent(db, alice);
    const b = await createEvent(db, bob);
    await expect(asUser(db, alice, () => insertObject(`${a.id}/stickers/x.webp`))).resolves.toBeDefined();
    await expect(asUser(db, alice, () => insertObject(`${b.id}/stickers/x.webp`))).rejects.toMatchObject({ code: '42501' });
  });

  it('un invitado solo puede leer la imagen de un sticker activo con stickers habilitados', async () => {
    const ev = await newEvent();
    const path = `${ev.id}/stickers/a.webp`;
    await db.query(`insert into storage.objects (bucket_id, name) values ('event-assets', $1)`, [path]);
    const sticker = (
      await db.query(`insert into event_stickers (event_id, kind, storage_path) values ($1, 'image', $2) returning id`, [ev.id, path])
    ).rows[0];

    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(1);

    await db.query('update event_stickers set enabled = false where id = $1', [sticker.id]);
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(0);

    await db.query('update event_stickers set enabled = true where id = $1', [sticker.id]);
    await db.query('update events set stickers_enabled = false where id = $1', [ev.id]);
    expect((await asAnon(db, () => readObject(path))).rows).toHaveLength(0);
  });

  it('un invitado no puede subir ni leer archivos que no son de un sticker', async () => {
    const ev = await newEvent();
    await db.query(`insert into storage.objects (bucket_id, name) values ('event-assets', $1)`, [`${ev.id}/stickers/suelto.webp`]);
    expect((await asAnon(db, () => readObject(`${ev.id}/stickers/suelto.webp`))).rows).toHaveLength(0);
    await expect(asAnon(db, () => insertObject(`${ev.id}/stickers/nuevo.webp`))).rejects.toMatchObject({ code: '42501' });
  });
});
