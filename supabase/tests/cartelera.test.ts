import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asAnon, asUser, connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';

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

const register = (slug: string, name: string) =>
  asAnon(db, () => db.query('select * from register_guest($1, $2, $3)', [slug, name, '1234']));

const submit = (token: string, path: string) =>
  asAnon(db, () => db.query('select * from submit_photo($1, $2)', [token, path]));

async function newGuest(eventId: string, slug: string, name: string) {
  const { rows } = await register(slug, name);
  return { id: rows[0].guest_id as string, token: rows[0].guest_token as string, eventId, slug };
}

describe('activación de la cámara con el QR del evento', () => {
  it('un evento nuevo usa el QR por defecto y tiene un código largo y secreto', async () => {
    const created = await asUser(db, owner, () => db.query(`select * from create_event('Fiesta QR')`));
    expect(created.rows[0].camera_unlock).toBe('on_event_qr');
    expect(created.rows[0].activation_code).toMatch(/^[0-9a-f]{32}$/);
  });

  it('el código NO sale en get_event_public ni lo puede leer un invitado', async () => {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_event_qr' });
    const pub = await asAnon(db, () => db.query('select * from get_event_public($1)', [ev.slug]));
    expect(Object.keys(pub.rows[0])).not.toContain('activation_code');
    await expect(asAnon(db, () => db.query('select activation_code from events'))).rejects.toThrow(/permission denied/);
  });

  it('sin activar no se puede subir una foto; con el código correcto sí', async () => {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_event_qr' });
    const g = await newGuest(ev.id, ev.slug, 'Ana Rojas');
    const path = `${ev.id}/${g.id}/a.jpg`;

    await expect(submit(g.token, path)).rejects.toMatchObject({ code: '42501' });

    const { rows: code } = await db.query<{ activation_code: string }>('select activation_code from events where id = $1', [ev.id]);
    const ok = await asAnon(db, () => db.query('select activate_camera($1, $2) as ok', [g.token, code[0].activation_code]));
    expect(ok.rows[0].ok).toBe(true);

    const photo = await submit(g.token, path);
    expect(photo.rows).toHaveLength(1);
  });

  it('un código equivocado no activa y cuenta como intento fallido', async () => {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_event_qr' });
    const g = await newGuest(ev.id, ev.slug, 'Bea Soto');
    const res = await asAnon(db, () => db.query('select activate_camera($1, $2) as ok', [g.token, 'codigo-equivocado']));
    expect(res.rows[0].ok).toBe(false);
    const state = await db.query('select camera_activated_at from guests where id = $1', [g.id]);
    expect(state.rows[0].camera_activated_at).toBeNull();
    const attempts = await db.query('select count(*)::int as n from identify_attempts where event_id = $1', [ev.id]);
    expect(attempts.rows[0].n).toBe(1);
  });

  it('frena la fuerza bruta: demasiados códigos equivocados seguidos se bloquean', async () => {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_event_qr' });
    const g = await newGuest(ev.id, ev.slug, 'Carla Díaz');
    for (let i = 0; i < 30; i++) {
      await asAnon(db, () => db.query('select activate_camera($1, $2)', [g.token, `mal-${i}`]), '10.0.0.9');
    }
    await expect(
      asAnon(db, () => db.query('select activate_camera($1, $2)', [g.token, 'otro']), '10.0.0.9'),
    ).rejects.toMatchObject({ code: '53400' });
  });

  it('un token inválido no activa nada', async () => {
    await expect(asAnon(db, () => db.query(`select activate_camera('token-falso', 'x')`))).rejects.toMatchObject({
      code: 'P0002',
    });
  });

  it('get_guest_by_token informa si la cámara ya está activada', async () => {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_event_qr' });
    const g = await newGuest(ev.id, ev.slug, 'Dana Vega');
    const before = await asAnon(db, () => db.query('select * from get_guest_by_token($1)', [g.token]));
    expect(before.rows[0].camera_activated_at).toBeNull();
    const { rows: code } = await db.query<{ activation_code: string }>('select activation_code from events where id = $1', [ev.id]);
    await asAnon(db, () => db.query('select activate_camera($1, $2)', [g.token, code[0].activation_code]));
    const after = await asAnon(db, () => db.query('select * from get_guest_by_token($1)', [g.token]));
    expect(after.rows[0].camera_activated_at).not.toBeNull();
  });

  it('rotar el código invalida el QR impreso pero no a quien ya activó', async () => {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_event_qr' });
    const early = await newGuest(ev.id, ev.slug, 'Eva Luna');
    const late = await newGuest(ev.id, ev.slug, 'Fer Mora');
    const { rows: first } = await db.query<{ activation_code: string }>('select activation_code from events where id = $1', [ev.id]);
    await asAnon(db, () => db.query('select activate_camera($1, $2)', [early.token, first[0].activation_code]));

    const rotated = await asUser(db, owner, () => db.query('select rotate_activation_code($1) as code', [ev.id]));
    const next = rotated.rows[0].code as string;
    expect(next).not.toBe(first[0].activation_code);
    expect(next).toMatch(/^[0-9a-f]{32}$/);

    const old = await asAnon(db, () => db.query('select activate_camera($1, $2) as ok', [late.token, first[0].activation_code]));
    expect(old.rows[0].ok).toBe(false);
    const fresh = await asAnon(db, () => db.query('select activate_camera($1, $2) as ok', [late.token, next]));
    expect(fresh.rows[0].ok).toBe(true);

    const earlyState = await db.query('select camera_activated_at from guests where id = $1', [early.id]);
    expect(earlyState.rows[0].camera_activated_at).not.toBeNull();
  });

  it('solo el dueño rota el código', async () => {
    const ev = await createEvent(db, owner);
    await expect(asUser(db, other, () => db.query('select rotate_activation_code($1)', [ev.id]))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asAnon(db, () => db.query('select rotate_activation_code($1)', [ev.id]))).rejects.toThrow(/permission denied/);
  });

  it('los otros modos siguen igual: on_identify sube sin activar', async () => {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_identify' });
    const g = await newGuest(ev.id, ev.slug, 'Gus Prado');
    const photo = await submit(g.token, `${ev.id}/${g.id}/a.jpg`);
    expect(photo.rows).toHaveLength(1);
  });

  it('rechaza un modo de cámara desconocido', async () => {
    const ev = await createEvent(db, owner);
    await expect(db.query(`update events set camera_unlock = 'siempre' where id = $1`, [ev.id])).rejects.toThrow(
      /events_camera_unlock_check/,
    );
  });
});

describe('fotos por lotes', () => {
  async function eventWithPhotos() {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_identify' });
    const g = await newGuest(ev.id, ev.slug, `Invitada ${Math.random().toString(36).slice(2, 7)} Lote`);
    for (const n of ['a', 'b', 'c']) await submit(g.token, `${ev.id}/${g.id}/${n}.jpg`);
    return { ev, g };
  }
  const visible = (token: string) =>
    asAnon(db, () => db.query('select storage_path from list_revealed_photos($1) order by storage_path', [token]));
  const publish = (eventId: string, as = owner) => asUser(db, as, () => db.query('select publish_photo_batch($1) as n', [eventId]));

  it('hasta que la dueña publica, nadie ve ninguna foto (ni las aprobadas)', async () => {
    const { g } = await eventWithPhotos();
    expect((await visible(g.token)).rows).toHaveLength(0);
  });

  it('publicar el lote muestra las aprobadas y devuelve cuántas fueron', async () => {
    const { ev, g } = await eventWithPhotos();
    const res = await publish(ev.id);
    expect(res.rows[0].n).toBe(3);
    expect((await visible(g.token)).rows).toHaveLength(3);
    const state = await db.query('select photos_revealed_at from events where id = $1', [ev.id]);
    expect(state.rows[0].photos_revealed_at).not.toBeNull();
  });

  it('las fotos que llegan después esperan al siguiente lote', async () => {
    const { ev, g } = await eventWithPhotos();
    await publish(ev.id);
    await db.query('update guests set photo_quota = 10 where id = $1', [g.id]);
    await submit(g.token, `${ev.id}/${g.id}/d.jpg`);
    expect((await visible(g.token)).rows).toHaveLength(3);
    expect((await publish(ev.id)).rows[0].n).toBe(1);
    expect((await visible(g.token)).rows).toHaveLength(4);
    expect((await publish(ev.id)).rows[0].n).toBe(0);
  });

  it('una foto rechazada no se ve, aunque ya estuviera publicada', async () => {
    const { ev, g } = await eventWithPhotos();
    await publish(ev.id);
    await db.query(`update photos set status = 'rejected' where storage_path = $1`, [`${ev.id}/${g.id}/a.jpg`]);
    expect((await visible(g.token)).rows.map((r) => r.storage_path)).not.toContain(`${ev.id}/${g.id}/a.jpg`);
  });

  it('una foto pendiente no se publica hasta que se apruebe', async () => {
    const { ev, g } = await eventWithPhotos();
    await db.query(`update photos set status = 'pending' where storage_path = $1`, [`${ev.id}/${g.id}/a.jpg`]);
    expect((await publish(ev.id)).rows[0].n).toBe(2);
    await db.query(`update photos set status = 'approved' where storage_path = $1`, [`${ev.id}/${g.id}/a.jpg`]);
    expect((await publish(ev.id)).rows[0].n).toBe(1);
    expect((await visible(g.token)).rows).toHaveLength(3);
  });

  it('el archivo en Storage solo se puede leer una vez publicado', async () => {
    const { ev, g } = await eventWithPhotos();
    const path = `${ev.id}/${g.id}/a.jpg`;
    const check = () => db.query<{ ok: boolean }>('select party_photo_is_revealed($1) as ok', [path]);
    expect((await check()).rows[0].ok).toBe(false);
    await publish(ev.id);
    expect((await check()).rows[0].ok).toBe(true);
  });

  it('otro organizador no puede publicar, y anon tampoco', async () => {
    const { ev } = await eventWithPhotos();
    await expect(publish(ev.id, other)).rejects.toMatchObject({ code: '42501' });
    await expect(asAnon(db, () => db.query('select publish_photo_batch($1)', [ev.id]))).rejects.toThrow(/permission denied/);
  });

  it('publicar un evento no publica las fotos de otro', async () => {
    const a = await eventWithPhotos();
    const b = await eventWithPhotos();
    await publish(a.ev.id);
    expect((await visible(b.g.token)).rows).toHaveLength(0);
  });
});

describe('subtítulo y tema del evento', () => {
  it('el subtítulo es opcional, de 1 a 80 caracteres', async () => {
    const ev = await createEvent(db, owner);
    await db.query(`update events set subtitle = 'Cumpleaños Fran' where id = $1`, [ev.id]);
    await db.query(`update events set subtitle = null where id = $1`, [ev.id]);
    await expect(db.query(`update events set subtitle = '   ' where id = $1`, [ev.id])).rejects.toThrow(/events_subtitle_len/);
    await expect(db.query(`update events set subtitle = $2 where id = $1`, [ev.id, 'a'.repeat(81)])).rejects.toThrow(
      /events_subtitle_len/,
    );
  });

  it('get_event_public entrega subtítulo y tema', async () => {
    const ev = await createEvent(db, owner);
    await db.query(`update events set subtitle = 'Cumpleaños Fran', theme = '{"preset":"rosa-chicle"}' where id = $1`, [ev.id]);
    const { rows } = await asAnon(db, () => db.query('select * from get_event_public($1)', [ev.slug]));
    expect(rows[0].subtitle).toBe('Cumpleaños Fran');
    expect(rows[0].theme).toEqual({ preset: 'rosa-chicle' });
  });

  const themes: Array<[string, unknown, boolean]> = [
    ['vacío', {}, true],
    ['un preset', { preset: 'rosa-chicle' }, true],
    ['preset de 30', { preset: 'a'.repeat(30) }, true],
    ['preset de 31', { preset: 'a'.repeat(31) }, false],
    ['preset con mayúsculas', { preset: 'Rosa' }, false],
    ['preset con espacios', { preset: 'rosa chicle' }, false],
    ['preset vacío', { preset: '' }, false],
    ['preset numérico', { preset: 5 }, false],
    ['clave ajena', { preset: 'rosa-chicle', css: 'x' }, false],
    ['no es objeto', [], false],
  ];
  it.each(themes)('tema %s', async (_name, theme, ok) => {
    const { rows } = await db.query<{ ok: boolean }>('select valid_event_theme($1::jsonb) as ok', [JSON.stringify(theme)]);
    expect(rows[0].ok).toBe(ok);
  });

  it('la columna rechaza un tema inválido, y el dueño puede guardar uno válido', async () => {
    const ev = await createEvent(db, owner);
    await expect(db.query(`update events set theme = '{"css":"x"}' where id = $1`, [ev.id])).rejects.toThrow(/events_theme_valid/);
    const res = await asUser(db, owner, () =>
      db.query(`update events set theme = '{"preset":"rosa-chicle"}', subtitle = 'Hola' where id = $1 returning id`, [ev.id]),
    );
    expect(res.rowCount).toBe(1);
  });
});

describe('createGuest sigue funcionando con las columnas nuevas', () => {
  it('un invitado cargado a mano empieza sin activar', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Hugo Paz');
    const { rows } = await db.query('select camera_activated_at from guests where id = $1', [g.id]);
    expect(rows[0].camera_activated_at).toBeNull();
  });
});
