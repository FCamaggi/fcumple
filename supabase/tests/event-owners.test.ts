import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  prepareSupabaseLikeDatabase,
  resetAndMigrate,
  resetPublicSchema,
} from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

let db: Client;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
});

afterAll(async () => {
  await db.end();
});

describe('event_owners: creador y relleno de eventos existentes (S1, S3)', () => {
  it('el creador queda registrado como dueno al crear el evento (trigger) y puede insertarse directo con RETURNING', async () => {
    const creator = await createUser(db, 'creadora@example.com');
    const { rows: directRows } = await asUser(db, creator, () =>
      db.query<{ id: string }>(
        `insert into public.events (owner_id, slug, name) values ($1, 'directo-creadora', 'Directo') returning id`,
        [creator],
      ),
    );
    expect(directRows).toHaveLength(1);

    const { rows: owners } = await asUser(db, creator, () =>
      db.query('select * from public.list_event_owners($1)', [directRows[0].id]),
    );
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({
      user_id: creator,
      email: 'creadora@example.com',
      is_creator: true,
      is_me: true,
    });
  });

  it('la migracion rellena event_owners con los eventos que ya existian antes de aplicarla', async () => {
    await prepareSupabaseLikeDatabase(db);
    await resetPublicSchema(db);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const beforeOwners = files.filter((f) => f < '20261109100023_event_owners.sql');
    for (const file of beforeOwners) {
      await db.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    }

    const legacyOwner = await createUser(db, 'antiguo@example.com');
    const preEvent = await createEvent(db, legacyOwner, { slug: 'evento-previo' });

    await db.query(readFileSync(path.join(MIGRATIONS_DIR, '20261109100023_event_owners.sql'), 'utf-8'));

    const { rows } = await asUser(db, legacyOwner, () =>
      db.query('select * from public.list_event_owners($1)', [preEvent.id]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: legacyOwner,
      email: 'antiguo@example.com',
      is_creator: true,
      is_me: true,
    });
  });
});

describe('co-dueno sumado por invitacion: mismos permisos que el creador (S1, S3)', () => {
  it('puede ver y editar el evento, leer/escribir guests, photos, event_frames, Storage y llamar RPC de organizador', async () => {
    const creator = await createUser(db, 'alice-owner@example.com');
    const coOwner = await createUser(db, 'bob-coowner@example.com');
    const ev = await createEvent(db, creator, { slug: 'fiesta-compartida' });
    const guest = await createGuest(db, ev.id, 'Invitada Uno');

    const { rows: invRows } = await asUser(db, creator, () =>
      db.query<{ token: string }>('select public.create_owner_invite($1) as token', [ev.id]),
    );
    const token = invRows[0].token;
    expect(token.length).toBeGreaterThanOrEqual(32);

    const { rows: accRows } = await asUser(db, coOwner, () =>
      db.query<{ event_id: string }>('select public.accept_owner_invite($1) as event_id', [token]),
    );
    expect(accRows[0].event_id).toBe(ev.id);

    // 1. select y update en events
    const evSelect = await asUser(db, coOwner, () =>
      db.query('select id, name from public.events where id = $1', [ev.id]),
    );
    expect(evSelect.rows).toHaveLength(1);

    const evUpdate = await asUser(db, coOwner, () =>
      db.query(`update public.events set name = 'Fiesta Editada' where id = $1 returning name`, [ev.id]),
    );
    expect(evUpdate.rows[0].name).toBe('Fiesta Editada');

    // 2. lectura y escritura en guests
    const guestsSelect = await asUser(db, coOwner, () =>
      db.query('select id from public.guests where event_id = $1', [ev.id]),
    );
    expect(guestsSelect.rows).toHaveLength(1);

    const guestInsert = await asUser(db, coOwner, () =>
      db.query<{ id: string }>(
        `insert into public.guests (event_id, full_name) values ($1, 'Invitado Nuevo') returning id`,
        [ev.id],
      ),
    );
    expect(guestInsert.rows).toHaveLength(1);

    // 3. lectura y escritura en photos
    const photoPath = `${ev.id}/${guest.id}/foto-coowner.jpg`;
    const photoInsert = await asUser(db, coOwner, () =>
      db.query<{ id: string }>(
        `insert into public.photos (event_id, guest_id, storage_path, status)
         values ($1, $2, $3, 'approved') returning id`,
        [ev.id, guest.id, photoPath],
      ),
    );
    expect(photoInsert.rows).toHaveLength(1);

    const photoSelect = await asUser(db, coOwner, () =>
      db.query('select id from public.photos where event_id = $1', [ev.id]),
    );
    expect(photoSelect.rows).toHaveLength(1);

    // 4. lectura y escritura en event_frames
    const framesSelect = await asUser(db, coOwner, () =>
      db.query('select id from public.event_frames where event_id = $1', [ev.id]),
    );
    expect(framesSelect.rows.length).toBeGreaterThan(0);

    const frameInsert = await asUser(db, coOwner, () =>
      db.query<{ id: string }>(
        `insert into public.event_frames (event_id, template, label, params, sort_order)
         values ($1, 'capas', 'Marco Co-dueno', '{"layers":[]}'::jsonb, 2) returning id`,
        [ev.id],
      ),
    );
    expect(frameInsert.rows).toHaveLength(1);

    // 5. Storage bajo {event_id}/ en party-photos
    await expect(
      asUser(db, coOwner, () =>
        db.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [photoPath]),
      ),
    ).resolves.toBeDefined();

    const storageSelect = await asUser(db, coOwner, () =>
      db.query(`select name from storage.objects where bucket_id = 'party-photos' and name = $1`, [photoPath]),
    );
    expect(storageSelect.rows).toEqual([{ name: photoPath }]);

    // 6. RPCs de organizador: regenerate_guest_token y publish_photo_batch
    const regen = await asUser(db, coOwner, () =>
      db.query('select * from public.regenerate_guest_token($1)', [guest.id]),
    );
    expect(regen.rows).toHaveLength(1);

    const published = await asUser(db, coOwner, () =>
      db.query<{ n: number }>('select public.publish_photo_batch($1) as n', [ev.id]),
    );
    expect(published.rows[0].n).toBe(1);
  });
});

describe('aislamiento de no-duenos y proteccion de tablas internas (S3)', () => {
  it('un no-dueno no ve nada y recibe 42501 en create_owner_invite y list_event_owners', async () => {
    const owner = await createUser(db, 'dueno-aislado@example.com');
    const stranger = await createUser(db, 'intruso@example.com');
    const ev = await createEvent(db, owner, { slug: 'evento-privado' });

    const seen = await asUser(db, stranger, () =>
      db.query('select id from public.events where id = $1', [ev.id]),
    );
    expect(seen.rows).toHaveLength(0);

    await expect(
      asUser(db, stranger, () => db.query('select public.create_owner_invite($1)', [ev.id])),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      asUser(db, stranger, () => db.query('select * from public.list_event_owners($1)', [ev.id])),
    ).rejects.toMatchObject({ code: '42501' });

    // Sin acceso directo a event_owners ni event_owner_invites para anon ni authenticated
    for (const table of ['event_owners', 'event_owner_invites']) {
      await expect(asAnon(db, () => db.query(`select * from public.${table}`))).rejects.toMatchObject({
        code: '42501',
      });
      await expect(asUser(db, owner, () => db.query(`select * from public.${table}`))).rejects.toMatchObject({
        code: '42501',
      });
    }
  });
});

describe('ciclo de vida y limites de invitaciones (S3)', () => {
  it('es de un solo uso: un segundo usuario recibe P0002', async () => {
    const owner = await createUser(db, 'inv-owner@example.com');
    const first = await createUser(db, 'inv-first@example.com');
    const second = await createUser(db, 'inv-second@example.com');
    const ev = await createEvent(db, owner);

    const { rows } = await asUser(db, owner, () =>
      db.query<{ token: string }>('select public.create_owner_invite($1) as token', [ev.id]),
    );
    const token = rows[0].token;

    await expect(
      asUser(db, first, () => db.query('select public.accept_owner_invite($1)', [token])),
    ).resolves.toBeDefined();

    await expect(
      asUser(db, second, () => db.query('select public.accept_owner_invite($1)', [token])),
    ).rejects.toMatchObject({ code: 'P0002' });
  });

  it('invitacion vencida, token desconocido y anonimo fallan con los codigos esperados', async () => {
    const owner = await createUser(db, 'exp-owner@example.com');
    const candidate = await createUser(db, 'exp-candidate@example.com');
    const ev = await createEvent(db, owner);

    const { rows } = await asUser(db, owner, () =>
      db.query<{ token: string }>('select public.create_owner_invite($1) as token', [ev.id]),
    );
    const expiredToken = rows[0].token;

    await asServiceRole(db, () =>
      db.query(`update public.event_owner_invites set expires_at = now() - interval '1 minute' where event_id = $1`, [
        ev.id,
      ]),
    );

    await expect(
      asUser(db, candidate, () => db.query('select public.accept_owner_invite($1)', [expiredToken])),
    ).rejects.toMatchObject({ code: 'P0002' });

    await expect(
      asUser(db, candidate, () => db.query('select public.accept_owner_invite($1)', ['token-inexistente-1234567890'])),
    ).rejects.toMatchObject({ code: 'P0002' });

    await expect(
      asAnon(db, () => db.query('select public.accept_owner_invite($1)', [expiredToken])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('si quien acepta ya es dueno, devuelve el event_id y no consume la invitacion', async () => {
    const owner = await createUser(db, 'already-owner@example.com');
    const other = await createUser(db, 'other-user@example.com');
    const ev = await createEvent(db, owner);

    const { rows } = await asUser(db, owner, () =>
      db.query<{ token: string }>('select public.create_owner_invite($1) as token', [ev.id]),
    );
    const token = rows[0].token;

    const selfAccept = await asUser(db, owner, () =>
      db.query<{ event_id: string }>('select public.accept_owner_invite($1) as event_id', [token]),
    );
    expect(selfAccept.rows[0].event_id).toBe(ev.id);

    // La invitacion sigue activa y otra persona puede usarla
    const otherAccept = await asUser(db, other, () =>
      db.query<{ event_id: string }>('select public.accept_owner_invite($1) as event_id', [token]),
    );
    expect(otherAccept.rows[0].event_id).toBe(ev.id);
  });

  it('la 6ta invitacion activa falla con 53400 invite limit reached', async () => {
    const owner = await createUser(db, 'limit-inv-owner@example.com');
    const ev = await createEvent(db, owner);

    for (let i = 0; i < 5; i++) {
      await asUser(db, owner, () => db.query('select public.create_owner_invite($1)', [ev.id]));
    }

    await expect(
      asUser(db, owner, () => db.query('select public.create_owner_invite($1)', [ev.id])),
    ).rejects.toMatchObject({
      code: '53400',
      message: expect.stringContaining('invite limit reached'),
    });
  });

  it('tres links generados seguidos y aceptados por tres cuentas distintas dejan a los tres como duenos', async () => {
    const owner = await createUser(db, 'tri-owner@example.com');
    const guests = [
      await createUser(db, 'tri-a@example.com'),
      await createUser(db, 'tri-b@example.com'),
      await createUser(db, 'tri-c@example.com'),
    ];
    const ev = await createEvent(db, owner);

    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { rows } = await asUser(db, owner, () =>
        db.query<{ token: string }>('select public.create_owner_invite($1) as token', [ev.id]),
      );
      tokens.push(rows[0].token);
    }

    // Aceptan en orden distinto al de creacion.
    for (const i of [2, 0, 1]) {
      await asUser(db, guests[i], () => db.query('select public.accept_owner_invite($1)', [tokens[i]]));
    }

    const { rows: owners } = await asUser(db, owner, () =>
      db.query<{ user_id: string }>('select user_id from public.list_event_owners($1)', [ev.id]),
    );
    expect(owners.map((o) => o.user_id).sort()).toEqual([owner, ...guests].sort());

    const { rows: invites } = await db.query<{ used_by: string | null }>(
      'select used_by from public.event_owner_invites where event_id = $1',
      [ev.id],
    );
    expect(invites.map((r) => r.used_by).sort()).toEqual([...guests].sort());
  });

  it('el tope de 10 duenos por evento frena tanto create_owner_invite como accept_owner_invite con 53400', async () => {
    const owner = await createUser(db, 'limit10-owner@example.com');
    const ev = await createEvent(db, owner);

    // Creamos una invitacion cuando todavia hay 1 dueno
    const { rows } = await asUser(db, owner, () =>
      db.query<{ token: string }>('select public.create_owner_invite($1) as token', [ev.id]),
    );
    const pendingToken = rows[0].token;

    // Llenamos hasta 10 duenos (1 creador + 9 adicionales)
    for (let i = 0; i < 9; i++) {
      const u = await createUser(db, `coowner-${i}@example.com`);
      await addOwner(db, ev.id, u);
    }

    await expect(
      asUser(db, owner, () => db.query('select public.create_owner_invite($1)', [ev.id])),
    ).rejects.toMatchObject({
      code: '53400',
      message: expect.stringContaining('owner limit reached'),
    });

    const eleventh = await createUser(db, 'eleventh@example.com');
    await expect(
      asUser(db, eleventh, () => db.query('select public.accept_owner_invite($1)', [pendingToken])),
    ).rejects.toMatchObject({
      code: '53400',
      message: expect.stringContaining('owner limit reached'),
    });
  });
});

describe('seguridad de tokens, inmutabilidad de owner_id y listado de duenos (S3)', () => {
  it('solo guarda token_hash en event_owner_invites (el token en claro no aparece en la tabla)', async () => {
    const owner = await createUser(db, 'hash-owner@example.com');
    const ev = await createEvent(db, owner);

    const { rows } = await asUser(db, owner, () =>
      db.query<{ token: string }>('select public.create_owner_invite($1) as token', [ev.id]),
    );
    const rawToken = rows[0].token;

    const stored = await asServiceRole(db, () =>
      db.query('select * from public.event_owner_invites where event_id = $1', [ev.id]),
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored.rows)).not.toContain(rawToken);
  });

  it('owner_id no se puede modificar con update (42501), y un co-dueno puede borrar el evento', async () => {
    const creator = await createUser(db, 'creator-del@example.com');
    const coOwner = await createUser(db, 'coowner-del@example.com');
    const ev = await createEvent(db, creator);
    await addOwner(db, ev.id, coOwner);

    await expect(
      asUser(db, creator, () =>
        db.query('update public.events set owner_id = $1 where id = $2', [coOwner, ev.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      asUser(db, coOwner, () =>
        db.query('update public.events set owner_id = $1 where id = $2', [coOwner, ev.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const del = await asUser(db, coOwner, () =>
      db.query('delete from public.events where id = $1 returning id', [ev.id]),
    );
    expect(del.rows).toHaveLength(1);
  });

  it('list_event_owners devuelve email, is_creator, is_me ordenados por created_at', async () => {
    const first = await createUser(db, 'primero@example.com');
    const second = await createUser(db, 'segundo@example.com');
    const third = await createUser(db, 'tercero@example.com');
    const ev = await createEvent(db, first);

    await db.query(
      `insert into public.event_owners (event_id, user_id, created_at)
       values ($1, $2, now() + interval '1 second'), ($1, $3, now() + interval '2 seconds')`,
      [ev.id, second, third],
    );

    const { rows } = await asUser(db, second, () =>
      db.query('select * from public.list_event_owners($1)', [ev.id]),
    );
    expect(rows.map((r) => ({ email: r.email, is_creator: r.is_creator, is_me: r.is_me }))).toEqual([
      { email: 'primero@example.com', is_creator: true, is_me: false },
      { email: 'segundo@example.com', is_creator: false, is_me: true },
      { email: 'tercero@example.com', is_creator: false, is_me: false },
    ]);
  });

  it('regresion: el limite de 10 de create_event solo cuenta eventos creados por el usuario, no donde es co-dueno', async () => {
    const creatorOther = await createUser(db, 'otro-creador@example.com');
    const user = await createUser(db, 'creador-diez@example.com');

    // Es co-dueno en 5 eventos ajenos
    for (let i = 0; i < 5; i++) {
      const shared = await createEvent(db, creatorOther);
      await addOwner(db, shared.id, user);
    }

    // Aun asi puede crear sus propios 10 eventos con create_event
    for (let i = 0; i < 10; i++) {
      const created = await asUser(db, user, () =>
        db.query(`select * from public.create_event($1)`, [`Mi evento ${i + 1}`]),
      );
      expect(created.rows).toHaveLength(1);
    }

    // El 11vo propio falla con 53400
    await expect(
      asUser(db, user, () => db.query(`select * from public.create_event('Mi evento 11')`)),
    ).rejects.toMatchObject({ code: '53400' });
  });
});
