import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import {
  addOwner,
  asAnon,
  asServiceRole,
  asUser,
  connect,
  createEvent,
  createGuest,
  createUser,
  resetAndMigrate,
} from './helpers';

// Originales servidos desde el PC del evento (T2 de odd/tasks/fotos-originales-pc.md): el PC solo comprueba la
// firma; quién puede ver qué foto lo decide la base, con la misma regla que la lectura de Storage.

const BASE_URL = 'https://fotos.ejemplo.me';
const SECRET = 'secreto-de-prueba-de-al-menos-32-caracteres';

let db: Client;
let owner: string;
let coOwner: string;
let stranger: string;
let eventId: string;
let guestId: string;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
  owner = await createUser(db, 'duena@example.com');
  coOwner = await createUser(db, 'codueno@example.com');
  stranger = await createUser(db, 'otra@example.com');
  const ev = await createEvent(db, owner);
  eventId = ev.id;
  await addOwner(db, eventId, coOwner);
  guestId = (await createGuest(db, eventId, 'Invitada Original')).id;
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query('delete from private.photo_archive');
  await db.query('delete from public.photos');
});

async function addPhoto(name: string, opts: { status?: string; published?: boolean; archived?: boolean } = {}) {
  const path = `${eventId}/${guestId}/${name}.jpg`;
  await db.query(
    `insert into public.photos (event_id, guest_id, storage_path, display_storage_path, status, published_at, original_archived_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      eventId,
      guestId,
      path,
      `${eventId}/${guestId}/${name}-display.jpg`,
      opts.status ?? 'approved',
      opts.published === false ? null : new Date(),
      opts.archived === false ? null : new Date(),
    ],
  );
  return path;
}

const configure = () =>
  db.query('insert into private.photo_archive (base_url, signing_secret) values ($1, $2)', [BASE_URL, SECRET]);

const urlFor = (path: string) => db.query<{ url: string | null }>('select photo_original_url($1) as url', [path]);

function expectSigned(url: string | null, path: string) {
  expect(url).not.toBeNull();
  const parsed = new URL(url as string);
  expect(`${parsed.origin}${decodeURIComponent(parsed.pathname)}`).toBe(`${BASE_URL}/p/${path}`);
  const exp = Number(parsed.searchParams.get('exp'));
  const now = Math.floor(Date.now() / 1000);
  expect(exp).toBeGreaterThan(now + 3500);
  expect(exp).toBeLessThan(now + 3700);
  const expected = createHmac('sha256', SECRET).update(`${path}\n${exp}`).digest('hex');
  expect(parsed.searchParams.get('sig')).toBe(expected);
}

describe('photo_original_url: enlace firmado al original en el PC', () => {
  it('sin el PC configurado devuelve null y la app sigue usando Storage', async () => {
    const path = await addPhoto('a');
    expect((await asAnon(db, () => urlFor(path))).rows[0].url).toBeNull();
  });

  it('con una foto que el PC todavía no archiva devuelve null', async () => {
    await configure();
    const path = await addPhoto('b', { archived: false });
    expect((await asAnon(db, () => urlFor(path))).rows[0].url).toBeNull();
  });

  it('firma el enlace de una foto aprobada y publicada para el invitado (anon)', async () => {
    await configure();
    const path = await addPhoto('c');
    expectSigned((await asAnon(db, () => urlFor(path))).rows[0].url, path);
  });

  it('a un invitado le niega una foto pendiente, rechazada o aprobada sin publicar', async () => {
    await configure();
    const pendiente = await addPhoto('d', { status: 'pending' });
    const rechazada = await addPhoto('e', { status: 'rejected' });
    const sinPublicar = await addPhoto('f', { published: false });
    for (const path of [pendiente, rechazada, sinPublicar]) {
      await expect(asAnon(db, () => urlFor(path))).rejects.toThrow(/not_allowed/);
    }
  });

  it('una ruta que no existe se niega igual que una prohibida (no revela si existe)', async () => {
    await configure();
    await expect(asAnon(db, () => urlFor(`${eventId}/${guestId}/nada.jpg`))).rejects.toThrow(/not_allowed/);
  });

  it('la copia liviana no es un original: se niega', async () => {
    await configure();
    await addPhoto('g');
    await expect(asAnon(db, () => urlFor(`${eventId}/${guestId}/g-display.jpg`))).rejects.toThrow(/not_allowed/);
  });

  it('los dueños del evento reciben el enlace de cualquier foto de su evento, incluso pendiente', async () => {
    await configure();
    const path = await addPhoto('h', { status: 'pending', published: false });
    expectSigned((await asUser(db, owner, () => urlFor(path))).rows[0].url, path);
    expectSigned((await asUser(db, coOwner, () => urlFor(path))).rows[0].url, path);
  });

  it('a una cuenta que no es dueña le niega las fotos no publicadas del evento', async () => {
    await configure();
    const path = await addPhoto('i', { status: 'pending', published: false });
    await expect(asUser(db, stranger, () => urlFor(path))).rejects.toThrow(/not_allowed/);
  });
});

describe('photo_original_url: la ruta manda, igual que en Storage', () => {
  // Storage decide quién es dueño por el evento de la ruta ({event_id}/…), y un dueño puede insertar filas en
  // `photos` con cualquier ruta. El RPC exige el mismo formato que submit_photo y que la ruta sea de su evento.
  it('una fila del evento A con la ruta de un original del evento B no da enlace al dueño de A', async () => {
    await configure();
    const otherOwner = await createUser(db, `duena-b-${Math.random().toString(36).slice(2, 7)}@example.com`);
    const evB = await createEvent(db, otherOwner);
    const guestB = (await createGuest(db, evB.id, 'Invitado Ajeno')).id;
    const foreignPath = `${evB.id}/${guestB}/orig.jpg`;
    await db.query(
      `insert into public.photos (event_id, guest_id, storage_path, status, original_archived_at)
       values ($1, $2, $3, 'pending', now())`,
      [eventId, guestId, foreignPath],
    );
    await expect(asUser(db, owner, () => urlFor(foreignPath))).rejects.toThrow(/not_allowed/);
  });

  it('rechaza rutas con otro formato o con saltos de línea, aunque la fila exista', async () => {
    await configure();
    for (const bad of [
      `${eventId}/${guestId}/x.jpg\n99999999999`,
      `${eventId}/${guestId}/sub/x.jpg`,
      `${eventId}/${guestId}/../x.jpg`,
      `${eventId}/${guestId}/x.jpg?exp=1`,
    ]) {
      await db.query(
        `insert into public.photos (event_id, guest_id, storage_path, status, published_at, original_archived_at)
         values ($1, $2, $3, 'approved', now(), now())`,
        [eventId, guestId, bad],
      );
      await expect(asUser(db, owner, () => urlFor(bad))).rejects.toThrow(/not_allowed/);
      await expect(asAnon(db, () => urlFor(bad))).rejects.toThrow(/not_allowed/);
    }
  });

  it('al dueño de otro evento le niega las fotos no publicadas', async () => {
    await configure();
    const otherOwner = await createUser(db, `duena-c-${Math.random().toString(36).slice(2, 7)}@example.com`);
    await createEvent(db, otherOwner);
    const path = await addPhoto('m', { status: 'pending', published: false });
    await expect(asUser(db, otherOwner, () => urlFor(path))).rejects.toThrow(/not_allowed/);
  });

  it('una consulta rechazada no cambia ninguna fila', async () => {
    await configure();
    const path = await addPhoto('n', { status: 'pending', published: false });
    const snapshot = async () => (await db.query('select * from public.photos order by storage_path')).rows;
    const before = await snapshot();
    await expect(asAnon(db, () => urlFor(path))).rejects.toThrow(/not_allowed/);
    expect(await snapshot()).toEqual(before);
  });
});

describe('secreto y estado del archivo', () => {
  it('ni anon ni authenticated pueden leer la configuración del PC', async () => {
    await configure();
    await expect(asAnon(db, () => db.query('select * from private.photo_archive'))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, owner, () => db.query('select * from private.photo_archive'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('exige https en la dirección del PC y un secreto de al menos 32 caracteres', async () => {
    await expect(
      db.query('insert into private.photo_archive (base_url, signing_secret) values ($1, $2)', ['http://fotos.ejemplo.me', SECRET]),
    ).rejects.toThrow(/photo_archive_base_url/);
    await expect(
      db.query('insert into private.photo_archive (base_url, signing_secret) values ($1, $2)', [BASE_URL, 'corto']),
    ).rejects.toThrow(/photo_archive_signing_secret/);
  });

  it('solo hay una configuración', async () => {
    await configure();
    await expect(configure()).rejects.toThrow(/duplicate key/);
  });

  it('el worker del PC (service_role) lista lo pendiente de archivar y lo marca como archivado', async () => {
    const path = await addPhoto('j', { archived: false });
    await addPhoto('k');
    await asServiceRole(db, async () => {
      const pending = await db.query('select storage_path from public.photos where original_archived_at is null');
      expect(pending.rows.map((r) => r.storage_path)).toEqual([path]);
      await db.query('update public.photos set original_archived_at = now() where storage_path = $1', [path]);
    });
    const { rows } = await db.query('select original_archived_at from public.photos where storage_path = $1', [path]);
    expect(rows[0].original_archived_at).not.toBeNull();
  });

  it('un invitado no puede marcar una foto como archivada', async () => {
    const path = await addPhoto('l', { archived: false });
    await asAnon(db, () => db.query('update public.photos set original_archived_at = now() where storage_path = $1', [path])).catch(
      () => undefined,
    );
    const { rows } = await db.query('select original_archived_at from public.photos where storage_path = $1', [path]);
    expect(rows[0].original_archived_at).toBeNull();
  });
});
