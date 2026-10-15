import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asAnon, asUser, connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';

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
  alice = await createUser(db, 'alice@example.com');
  bob = await createUser(db, 'bob@example.com');
  evA = await createEvent(db, alice, { slug: 'fiesta-alice' });
  evB = await createEvent(db, bob, { slug: 'fiesta-bob' });
  guestA = await createGuest(db, evA.id, 'Ana Rojas');
  guestB = await createGuest(db, evB.id, 'Beto Mora');
  await db.query(
    `insert into photos (event_id, guest_id, storage_path, status) values
       ($1, $2, $3, 'approved'), ($4, $5, $6, 'approved')`,
    [evA.id, guestA.id, `${evA.id}/${guestA.id}/a.jpg`, evB.id, guestB.id, `${evB.id}/${guestB.id}/b.jpg`],
  );
  await db.query(
    `insert into posts (event_id, title, body, published_at) values
       ($1, 'Aviso A', 'a', now() - interval '1 hour'), ($2, 'Aviso B', 'b', now() - interval '1 hour')`,
    [evA.id, evB.id],
  );
});

afterAll(async () => {
  await db.end();
});

describe('RLS: un organizador solo ve lo suyo', () => {
  it.each(['events', 'guests', 'photos', 'posts'])('select en %s', async (table) => {
    const { rows } = await asUser(db, alice, () => db.query(`select * from public.${table}`));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.event_id ?? row.id).toBe(evA.id);
    }
  });

  it('no puede insertar un invitado en el evento de otro', async () => {
    await expect(
      asUser(db, alice, () =>
        db.query(`insert into guests (event_id, full_name) values ($1, 'Intruso Mal')`, [evB.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('no puede mover un invitado propio al evento de otro', async () => {
    await expect(
      asUser(db, alice, () => db.query(`update guests set event_id = $1 where id = $2`, [evB.id, guestA.id])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('actualizar o borrar filas ajenas afecta 0 filas', async () => {
    const upd = await asUser(db, alice, () =>
      db.query(`update events set name = 'hackeado' where id = $1`, [evB.id]),
    );
    expect(upd.rowCount).toBe(0);
    const del = await asUser(db, alice, () => db.query(`delete from guests where id = $1`, [guestB.id]));
    expect(del.rowCount).toBe(0);
    const { rows } = await db.query('select name from events where id = $1', [evB.id]);
    expect(rows[0].name).not.toBe('hackeado');
  });

  it('no puede crear un evento a nombre de otro', async () => {
    await expect(
      asUser(db, alice, () =>
        db.query(`insert into events (owner_id, slug, name) values ($1, 'robado-1234', 'x')`, [bob]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('no puede invocar check_in_guest sobre un invitado ajeno', async () => {
    await expect(
      asUser(db, alice, () => db.query('select * from check_in_guest($1)', [guestB.token])),
    ).rejects.toMatchObject({ code: '42501' });
    const { rows } = await db.query('select checked_in_at from guests where id = $1', [guestB.id]);
    expect(rows[0].checked_in_at).toBeNull();
  });

  it('una foto no puede apuntar a un invitado de otro evento (clave foranea compuesta)', async () => {
    await expect(
      db.query(`insert into photos (event_id, guest_id, storage_path) values ($1, $2, 'x/y/z.jpg')`, [
        evA.id,
        guestB.id,
      ]),
    ).rejects.toThrow(/photos_guest_same_event/);
  });
});

describe('anon: sin acceso directo a ninguna tabla', () => {
  it.each(['events', 'guests', 'photos', 'posts', 'post_images', 'identify_attempts'])(
    '%s',
    async (table) => {
      await expect(asAnon(db, () => db.query(`select * from public.${table}`))).rejects.toMatchObject({
        code: '42501',
      });
    },
  );
});

describe('RPC publicas: nunca cruzan eventos', () => {
  it('get_guest_by_token solo devuelve al propio invitado', async () => {
    const { rows } = await asAnon(db, () => db.query('select * from get_guest_by_token($1)', [guestA.token]));
    expect(rows).toHaveLength(1);
    expect(rows[0].event_id).toBe(evA.id);
  });

  it('list_published_posts por slug solo trae los avisos de ese evento', async () => {
    const a = await asAnon(db, () => db.query('select title from list_published_posts($1)', ['fiesta-alice']));
    expect(a.rows).toEqual([{ title: 'Aviso A' }]);
    const b = await asAnon(db, () => db.query('select title from list_published_posts($1)', ['fiesta-bob']));
    expect(b.rows).toEqual([{ title: 'Aviso B' }]);
  });

  it('list_revealed_photos solo trae fotos del evento del token', async () => {
    await db.query('update events set photos_revealed_at = now()');
    const { rows } = await asAnon(db, () => db.query('select * from list_revealed_photos($1)', [guestA.token]));
    expect(rows).toHaveLength(1);
    expect(rows[0].storage_path.startsWith(evA.id)).toBe(true);
    await db.query('update events set photos_revealed_at = null');
  });

  it('list_revealed_photos no responde sin un token valido', async () => {
    await db.query('update events set photos_revealed_at = now()');
    const { rows } = await asAnon(db, () => db.query('select * from list_revealed_photos($1)', ['token-falso']));
    expect(rows).toHaveLength(0);
    await db.query('update events set photos_revealed_at = null');
  });

  it('las rutas reveladas no contienen ningun token de invitado', async () => {
    await db.query('update events set photos_revealed_at = now()');
    const { rows } = await asAnon(db, () => db.query('select * from list_revealed_photos($1)', [guestA.token]));
    for (const row of rows) {
      expect(row.storage_path).not.toContain(guestA.token);
    }
    await db.query('update events set photos_revealed_at = null');
  });
});

describe('Storage: politicas por evento', () => {
  const insertObject = (bucket: string, name: string) =>
    db.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name]);

  it('un invitado solo sube dentro de su carpeta {event_id}/{guest_id}/', async () => {
    await expect(asAnon(db, () => insertObject('party-photos', `${evA.id}/${guestA.id}/ok.jpg`))).resolves.toBeDefined();
  });

  it('un invitado no sube a la carpeta de otro invitado ni de otro evento', async () => {
    await expect(
      asAnon(db, () => insertObject('party-photos', `${evA.id}/${guestB.id}/mal.jpg`)),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asAnon(db, () => insertObject('party-photos', `${evB.id}/${guestA.id}/mal.jpg`)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('el token ya no sirve como carpeta (a diferencia de la Fase 0)', async () => {
    await expect(
      asAnon(db, () => insertObject('party-photos', `${guestA.token}/foto.jpg`)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('un invitado no puede subir al bucket de avisos', async () => {
    await expect(
      asAnon(db, () => insertObject('post-images', `${evA.id}/x.jpg`)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('anon no lee fotos hasta que el rollo se revela y la foto esta aprobada', async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [
      `${evA.id}/${guestA.id}/a.jpg`,
    ]);
    const hidden = await asAnon(db, () =>
      db.query(`select name from storage.objects where bucket_id = 'party-photos' and name = $1`, [
        `${evA.id}/${guestA.id}/a.jpg`,
      ]),
    );
    expect(hidden.rows).toHaveLength(0);

    await db.query('update events set photos_revealed_at = now() where id = $1', [evA.id]);
    const shown = await asAnon(db, () =>
      db.query(`select name from storage.objects where bucket_id = 'party-photos' and name = $1`, [
        `${evA.id}/${guestA.id}/a.jpg`,
      ]),
    );
    expect(shown.rows).toHaveLength(1);
    await db.query('update events set photos_revealed_at = null where id = $1', [evA.id]);
  });

  it('el organizador lee los archivos de su evento y no los del otro', async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [
      `${evB.id}/${guestB.id}/b.jpg`,
    ]);
    const { rows } = await asUser(db, alice, () =>
      db.query(`select name from storage.objects where bucket_id = 'party-photos'`),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.name.startsWith(evA.id)).toBe(true);
    }
  });

  it('el organizador solo sube avisos a su propio evento', async () => {
    await expect(
      asUser(db, alice, () => insertObject('post-images', `${evA.id}/portada.jpg`)),
    ).resolves.toBeDefined();
    await expect(
      asUser(db, alice, () => insertObject('post-images', `${evB.id}/portada.jpg`)),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
