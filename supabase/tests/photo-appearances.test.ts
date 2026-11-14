import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asAnon, asUser, connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';

/**
 * «Aparezco en esta foto»: cada invitado marca a mano las fotos publicadas donde sale y arma su álbum. Sin
 * biometría. Las marcas son privadas: solo las ve quien las hizo, a través de list_revealed_photos.
 */

let db: Client;
let owner: string;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
  owner = await createUser(db, 'organizadora@example.com');
});

afterAll(async () => {
  await db.end();
});

const submit = (token: string, path: string) =>
  asAnon(db, () => db.query('select * from submit_photo($1, $2, null)', [token, path]));
const setAppears = (token: string, path: string, appears: boolean) =>
  asAnon(db, () => db.query<{ appears: boolean }>('select set_photo_appearance($1, $2, $3) as appears', [token, path, appears]));
const revealed = async (token: string) => {
  const { rows } = await asAnon(db, () =>
    db.query<{ storage_path: string; appears: boolean }>(
      'select storage_path, appears from list_revealed_photos($1) order by storage_path',
      [token],
    ),
  );
  return rows;
};

/** Un evento con dos invitados y tres fotos de Ana: a y b publicadas, c pendiente. */
async function scenario() {
  const ev = await createEvent(db, owner, { camera_unlock: 'on_identify' });
  const ana = await createGuest(db, ev.id, `Ana ${Math.random().toString(36).slice(2, 7)} Rojas`, { photo_quota: 5 });
  const beto = await createGuest(db, ev.id, `Beto ${Math.random().toString(36).slice(2, 7)} Soto`, { photo_quota: 5 });
  const path = (n: string) => `${ev.id}/${ana.id}/${n}.jpg`;
  for (const n of ['a', 'b', 'c']) await submit(ana.token, path(n));
  await db.query(
    `update photos set status = 'approved', published_at = now() where storage_path = any($1)`,
    [[path('a'), path('b')]],
  );
  return { ev, ana, beto, path };
}

describe('aparezco en esta foto', () => {
  it('nadie aparece en nada al principio', async () => {
    const { beto, path } = await scenario();
    expect(await revealed(beto.token)).toEqual([
      { storage_path: path('a'), appears: false },
      { storage_path: path('b'), appears: false },
    ]);
  });

  it('un invitado marca una foto publicada de otro y la ve marcada solo él', async () => {
    const { ana, beto, path } = await scenario();
    const { rows } = await setAppears(beto.token, path('a'), true);
    expect(rows[0].appears).toBe(true);

    expect(await revealed(beto.token)).toEqual([
      { storage_path: path('a'), appears: true },
      { storage_path: path('b'), appears: false },
    ]);
    // Ana tomó la foto, pero la marca es de Beto.
    expect((await revealed(ana.token)).every((r) => r.appears === false)).toBe(true);
  });

  it('marcar dos veces no duplica y desmarcar la quita', async () => {
    const { beto, path } = await scenario();
    await setAppears(beto.token, path('a'), true);
    await setAppears(beto.token, path('a'), true);
    const { rows: mine } = await db.query(
      'select count(*)::int as n from photo_appearances pa join photos p on p.id = pa.photo_id where p.storage_path = $1',
      [path('a')],
    );
    expect(mine[0].n).toBe(1);

    const { rows } = await setAppears(beto.token, path('a'), false);
    expect(rows[0].appears).toBe(false);
    expect((await revealed(beto.token))[0].appears).toBe(false);
    // Desmarcar algo no marcado tampoco falla.
    await expect(setAppears(beto.token, path('b'), false)).resolves.toBeDefined();
  });

  it('no deja marcar una foto sin publicar, de otro evento o inexistente, y responde igual en los tres casos', async () => {
    const { beto, path } = await scenario();
    const other = await scenario();
    for (const p of [path('c'), other.path('a'), `${other.ev.id}/${other.ana.id}/no-existe.jpg`]) {
      await expect(setAppears(beto.token, p, true)).rejects.toMatchObject({ code: '42501' });
    }
    const { rows } = await db.query(
      'select count(*)::int as n from photo_appearances pa join guests g on g.id = pa.guest_id where g.id = $1',
      [beto.id],
    );
    expect(rows[0].n).toBe(0);
  });

  it('un token inválido o de un invitado no aprobado no marca nada', async () => {
    const { beto, path } = await scenario();
    await expect(setAppears('token-que-no-existe', path('a'), true)).rejects.toMatchObject({ code: 'P0002' });
    await db.query(`update guests set approval_status = 'pending' where id = $1`, [beto.id]);
    await expect(setAppears(beto.token, path('a'), true)).rejects.toMatchObject({ code: 'P0002' });
  });

  it('las marcas no se leen ni escriben directo: ni anon ni una organizadora', async () => {
    await scenario();
    await expect(asAnon(db, () => db.query('select * from photo_appearances'))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, owner, () => db.query('select * from photo_appearances'))).rejects.toThrow(/permission denied/);
  });

  it('borrar la foto o el invitado borra sus marcas', async () => {
    const { beto, path } = await scenario();
    await setAppears(beto.token, path('a'), true);
    await setAppears(beto.token, path('b'), true);
    await db.query('delete from photos where storage_path = $1', [path('a')]);
    const left = await db.query('select count(*)::int as n from photo_appearances where guest_id = $1', [beto.id]);
    expect(left.rows[0].n).toBe(1);
    await db.query('delete from guests where id = $1', [beto.id]);
    const none = await db.query('select count(*)::int as n from photo_appearances where guest_id = $1', [beto.id]);
    expect(none.rows[0].n).toBe(0);
  });
});
