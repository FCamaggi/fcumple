import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asAnon, asUser, connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';

let db: Client;
let owner: string;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
  owner = await createUser(db, 'organizador@example.com');
});

afterAll(async () => {
  await db.end();
});

const anon = <T>(fn: () => Promise<T>) => asAnon(db, fn);

describe('create_event', () => {
  it('genera un slug con sufijo aleatorio y asigna al usuario autenticado como dueno', async () => {
    const { rows } = await asUser(db, owner, () =>
      db.query(`select * from create_event($1, null, 'Casa de Fabrizio')`, ['Cumpleaños de Fabrizio']),
    );
    expect(rows[0].owner_id).toBe(owner);
    expect(rows[0].slug).toMatch(/^cumpleanos-de-fabrizio-[a-z2-9]{4}$/);
    expect(rows[0].location).toBe('Casa de Fabrizio');
  });

  it('dos eventos con el mismo nombre obtienen slugs distintos', async () => {
    const [a, b] = await Promise.all([
      asUser(db, owner, () => db.query(`select slug from create_event('Fiesta')`)),
      (async () => asUser(db, owner, () => db.query(`select slug from create_event('Fiesta')`)))(),
    ]);
    expect(a.rows[0].slug).not.toBe(b.rows[0].slug);
  });

  it('usa "evento" si el nombre no tiene caracteres utilizables', async () => {
    const { rows } = await asUser(db, owner, () => db.query(`select slug from create_event('!!!')`));
    expect(rows[0].slug).toMatch(/^evento-[a-z2-9]{4}$/);
  });

  it('un evento nuevo es abierto por defecto (se inscribe quien tenga el enlace)', async () => {
    const { rows } = await asUser(db, owner, () => db.query(`select access_mode from create_event('Fiesta abierta')`));
    expect(rows[0].access_mode).toBe('open');
  });

  it('cada organizador puede tener hasta 10 eventos', async () => {
    const busy = await createUser(db, 'ocupado@example.com');
    for (let i = 0; i < 10; i++) {
      await asUser(db, busy, () => db.query(`select * from create_event('Evento ${i}')`));
    }
    await expect(
      asUser(db, busy, () => db.query(`select * from create_event('Uno de mas')`)),
    ).rejects.toMatchObject({ code: '53400' });

    // El tope es por cuenta: otro organizador no se ve afectado.
    await expect(
      asUser(db, owner, () => db.query(`select * from create_event('Otro organizador')`)),
    ).resolves.toBeDefined();
  });

  it('anon no puede crear eventos', async () => {
    await expect(anon(() => db.query(`select * from create_event('Colada')`))).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('get_event_public', () => {
  it('expone los datos del hub y nada del organizador', async () => {
    const ev = await createEvent(db, owner, { slug: 'hub-publico', access_mode: 'open' });
    const { rows } = await anon(() => db.query('select * from get_event_public($1)', ['hub-publico']));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ev.id);
    expect(rows[0].access_mode).toBe('open');
    expect(rows[0]).not.toHaveProperty('identifier');
    expect(rows[0]).not.toHaveProperty('owner_id');
    expect(rows[0].photos_revealed).toBe(false);
  });

  it('un slug desconocido devuelve cero filas', async () => {
    const { rows } = await anon(() => db.query('select * from get_event_public($1)', ['nada-xxxx']));
    expect(rows).toHaveLength(0);
  });
});

describe('get_guest_by_token', () => {
  it('no expone admin_note ni el token', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ada Lovelace');
    await db.query(`update guests set admin_note = 'vip secreto' where id = $1`, [g.id]);

    const { rows } = await anon(() => db.query('select * from get_guest_by_token($1)', [g.token]));
    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe('Ada Lovelace');
    expect(JSON.stringify(rows[0])).not.toContain('vip secreto');
    expect(rows[0]).not.toHaveProperty('token');
    expect(rows[0]).not.toHaveProperty('admin_note');
  });

  it('un token inexistente devuelve cero filas', async () => {
    const { rows } = await anon(() => db.query('select * from get_guest_by_token($1)', ['nope']));
    expect(rows).toHaveLength(0);
  });
});

describe('submit_rsvp', () => {
  it('falla si el evento no tiene RSVP activado', async () => {
    const ev = await createEvent(db, owner, { rsvp_enabled: false });
    const g = await createGuest(db, ev.id, 'Ana Rojas', { plus_ones_allowed: 2 });
    await expect(
      anon(() => db.query(`select * from submit_rsvp($1, 'confirmed', 1)`, [g.token])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('guarda la respuesta cuando esta activado y respeta el maximo de acompanantes', async () => {
    const ev = await createEvent(db, owner, { rsvp_enabled: true });
    const g = await createGuest(db, ev.id, 'Ana Rojas', { plus_ones_allowed: 2 });

    const ok = await anon(() => db.query(`select * from submit_rsvp($1, 'confirmed', 2, 'voy')`, [g.token]));
    expect(ok.rows[0]).toMatchObject({ status: 'confirmed', plus_ones_confirmed: 2, guest_note: 'voy' });

    await expect(
      anon(() => db.query(`select * from submit_rsvp($1, 'confirmed', 3)`, [g.token])),
    ).rejects.toMatchObject({ code: '22023' });
    await expect(
      anon(() => db.query(`select * from submit_rsvp($1, 'pending', 0)`, [g.token])),
    ).rejects.toMatchObject({ code: '22023' });
  });

  it('get_public_headcount suma confirmados con sus acompanantes, solo del evento', async () => {
    const ev = await createEvent(db, owner, { slug: 'conteo-1234', rsvp_enabled: true });
    const other = await createEvent(db, owner, { rsvp_enabled: true });
    const a = await createGuest(db, ev.id, 'Ana Rojas', { plus_ones_allowed: 2 });
    await createGuest(db, ev.id, 'Beto Mora');
    const c = await createGuest(db, other.id, 'Carla Diaz', { plus_ones_allowed: 5 });
    await anon(() => db.query(`select * from submit_rsvp($1, 'confirmed', 2)`, [a.token]));
    await anon(() => db.query(`select * from submit_rsvp($1, 'confirmed', 5)`, [c.token]));

    const { rows } = await anon(() => db.query('select get_public_headcount($1) as n', ['conteo-1234']));
    expect(rows[0].n).toBe(3);
  });
});

describe('fotos: cupo, rutas y desbloqueo de camara', () => {
  const photoPath = (ev: { id: string }, g: { id: string }, file = 'f.jpg') => `${ev.id}/${g.id}/${file}`;

  it('registra una foto con la ruta {event_id}/{guest_id}/ y la auto-aprueba por defecto', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');
    const { rows } = await anon(() =>
      db.query('select * from submit_photo($1, $2, $3)', [
        g.token,
        photoPath(ev, g),
        photoPath(ev, g, 'f-display.jpg'),
      ]),
    );
    expect(rows[0].status).toBe('approved');
    expect(rows[0].display_storage_path).toBe(photoPath(ev, g, 'f-display.jpg'));
  });

  it('deja en pending a quien no tiene auto-aprobacion', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas', { auto_approve_photos: false });
    const { rows } = await anon(() => db.query('select * from submit_photo($1, $2)', [g.token, photoPath(ev, g)]));
    expect(rows[0].status).toBe('pending');
  });

  it('rechaza rutas con el token, de otro invitado o de otro evento', async () => {
    const ev = await createEvent(db, owner);
    const other = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');
    const h = await createGuest(db, ev.id, 'Beto Mora');

    for (const bad of [`${g.token}/f.jpg`, photoPath(ev, h), photoPath(other, g), 'f.jpg']) {
      await expect(
        anon(() => db.query('select * from submit_photo($1, $2)', [g.token, bad])),
      ).rejects.toMatchObject({ code: '22023' });
    }
    await expect(
      anon(() => db.query('select * from submit_photo($1, $2, $3)', [g.token, photoPath(ev, g), `x/${g.id}/d.jpg`])),
    ).rejects.toMatchObject({ code: '22023' });
  });

  it('aplica el cupo contando todas las filas', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas', { photo_quota: 2 });
    await anon(() => db.query('select * from submit_photo($1, $2)', [g.token, photoPath(ev, g, '1.jpg')]));
    await anon(() => db.query('select * from submit_photo($1, $2)', [g.token, photoPath(ev, g, '2.jpg')]));
    await db.query(`update photos set status = 'rejected' where guest_id = $1`, [g.id]);

    await expect(
      anon(() => db.query('select * from submit_photo($1, $2)', [g.token, photoPath(ev, g, '3.jpg')])),
    ).rejects.toMatchObject({ code: '22023' });

    const { rows } = await anon(() => db.query('select * from get_photo_quota($1)', [g.token]));
    expect(rows[0]).toEqual({ quota: 2, used: 2 });
  });

  describe('reintento idempotente (respuesta perdida)', () => {
    const submit = (token: string, ...args: (string | null)[]) =>
      anon(() => db.query('select * from submit_photo($1, $2, $3)', [token, args[0], args[1] ?? null]));

    it('repetir la misma ruta devuelve la misma foto y no gasta otro disparo', async () => {
      const ev = await createEvent(db, owner);
      const g = await createGuest(db, ev.id, 'Ana Rojas', { photo_quota: 3 });

      const first = await submit(g.token, photoPath(ev, g));
      const again = await submit(g.token, photoPath(ev, g));

      expect(again.rows).toHaveLength(1);
      expect(again.rows[0].id).toBe(first.rows[0].id);
      const count = await db.query('select count(*)::int as n from photos where guest_id = $1', [g.id]);
      expect(count.rows[0].n).toBe(1);
      const quota = await anon(() => db.query('select * from get_photo_quota($1)', [g.token]));
      expect(quota.rows[0]).toEqual({ quota: 3, used: 1 });
    });

    it('si era el último disparo, el reintento igual devuelve la foto en vez de «cupo agotado»', async () => {
      const ev = await createEvent(db, owner);
      const g = await createGuest(db, ev.id, 'Ana Rojas', { photo_quota: 1 });

      const first = await submit(g.token, photoPath(ev, g));
      const again = await submit(g.token, photoPath(ev, g));
      expect(again.rows[0].id).toBe(first.rows[0].id);

      // Una ruta distinta sí es otra foto y el cupo sigue aplicándose.
      await expect(submit(g.token, photoPath(ev, g, 'otra.jpg'))).rejects.toMatchObject({ code: '22023' });
    });

    it('conserva el estado de la fila original (no la vuelve a aprobar ni a poner en pendiente)', async () => {
      const ev = await createEvent(db, owner);
      const g = await createGuest(db, ev.id, 'Ana Rojas');
      await submit(g.token, photoPath(ev, g));
      await db.query(`update photos set status = 'rejected' where guest_id = $1`, [g.id]);

      const again = await submit(g.token, photoPath(ev, g));
      expect(again.rows[0].status).toBe('rejected');
    });

    it('si la copia liviana no estaba, el reintento la registra; si ya estaba, no la pisa', async () => {
      const ev = await createEvent(db, owner);
      const g = await createGuest(db, ev.id, 'Ana Rojas');
      await submit(g.token, photoPath(ev, g));

      const withDisplay = await submit(g.token, photoPath(ev, g), photoPath(ev, g, 'f-display.jpg'));
      expect(withDisplay.rows[0].display_storage_path).toBe(photoPath(ev, g, 'f-display.jpg'));

      const other = await submit(g.token, photoPath(ev, g), photoPath(ev, g, 'otra-display.jpg'));
      expect(other.rows[0].display_storage_path).toBe(photoPath(ev, g, 'f-display.jpg'));
    });

    it('el reintento sigue exigiendo el desbloqueo de la cámara y la ruta del invitado', async () => {
      const ev = await createEvent(db, owner, { camera_unlock: 'on_checkin' });
      const g = await createGuest(db, ev.id, 'Ana Rojas');
      const h = await createGuest(db, ev.id, 'Beto Mora');
      const k = await createGuest(db, ev.id, 'Carla Diaz');
      await asUser(db, owner, () => db.query('select * from check_in_guest($1)', [g.token]));
      await asUser(db, owner, () => db.query('select * from check_in_guest($1)', [h.token]));
      await submit(g.token, photoPath(ev, g));

      // La ruta de otro invitado no se puede reclamar, ni siquiera siendo una foto ya registrada.
      await expect(submit(h.token, photoPath(ev, g))).rejects.toMatchObject({ code: '22023' });
      // Y un invitado sin check-in sigue sin poder subir.
      await expect(submit(k.token, photoPath(ev, k))).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('con camera_unlock = on_checkin exige el check-in del organizador', async () => {
    const ev = await createEvent(db, owner, { camera_unlock: 'on_checkin' });
    const g = await createGuest(db, ev.id, 'Ana Rojas');

    await expect(
      anon(() => db.query('select * from submit_photo($1, $2)', [g.token, photoPath(ev, g)])),
    ).rejects.toMatchObject({ code: '42501' });

    const checked = await asUser(db, owner, () => db.query('select * from check_in_guest($1)', [g.token]));
    expect(checked.rows[0].checked_in_at).not.toBeNull();

    await expect(
      anon(() => db.query('select * from submit_photo($1, $2)', [g.token, photoPath(ev, g)])),
    ).resolves.toBeDefined();
  });

  it('un invitado pendiente o rechazado no puede subir fotos', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas', { approval_status: 'pending' });
    await expect(
      anon(() => db.query('select * from submit_photo($1, $2)', [g.token, photoPath(ev, g)])),
    ).rejects.toMatchObject({ code: 'P0002' });
  });
});

describe('check_in_guest', () => {
  it('es idempotente: no pisa la primera hora de llegada', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');
    const first = await asUser(db, owner, () => db.query('select * from check_in_guest($1)', [g.token]));
    await new Promise((r) => setTimeout(r, 20));
    const second = await asUser(db, owner, () => db.query('select * from check_in_guest($1)', [g.token]));
    expect(second.rows[0].checked_in_at).toEqual(first.rows[0].checked_in_at);
  });

  it('un invitado no puede marcarse a si mismo (anon no tiene permiso)', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');
    await expect(anon(() => db.query('select * from check_in_guest($1)', [g.token]))).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('un token inexistente falla con P0002', async () => {
    await expect(
      asUser(db, owner, () => db.query('select * from check_in_guest($1)', ['nope'])),
    ).rejects.toMatchObject({ code: 'P0002' });
  });

  it('deja de estar en check-in si el invitado deja de estar confirmado', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas', { status: 'confirmed' });
    await asUser(db, owner, () => db.query('select * from check_in_guest($1)', [g.token]));
    await db.query(`update guests set status = 'declined' where id = $1`, [g.id]);
    const { rows } = await db.query('select checked_in_at from guests where id = $1', [g.id]);
    expect(rows[0].checked_in_at).toBeNull();
  });
});

describe('avisos publicados', () => {
  it('solo salen los publicados y vigentes, con sus imagenes ordenadas', async () => {
    const ev = await createEvent(db, owner, { slug: 'avisos-1234' });
    const live = await db.query(
      `insert into posts (event_id, title, body, published_at) values ($1, 'Vigente', 'x', now() - interval '1 day') returning id`,
      [ev.id],
    );
    await db.query(`insert into posts (event_id, title, body) values ($1, 'Borrador', 'x')`, [ev.id]);
    await db.query(
      `insert into posts (event_id, title, body, published_at) values ($1, 'Programado', 'x', now() + interval '1 day')`,
      [ev.id],
    );
    await db.query(
      `insert into post_images (event_id, post_id, storage_path, position) values ($1, $2, 'b.jpg', 2), ($1, $2, 'a.jpg', 1)`,
      [ev.id, live.rows[0].id],
    );

    const { rows } = await anon(() => db.query('select * from list_published_posts($1)', ['avisos-1234']));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Vigente');
    expect(rows[0].images).toEqual(['a.jpg', 'b.jpg']);
  });
});

describe('regenerate_guest_token', () => {
  it('cambia el token, borra el PIN, cierra la sesion anterior y limpia claimed_at', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');
    await db.query('update guests set claimed_at = now(), last_seen_at = now() where id = $1', [g.id]);
    await db.query(`insert into guest_credentials (guest_id, pin_hash) values ($1, 'x')`, [g.id]);

    const { rows } = await asUser(db, owner, () => db.query('select * from regenerate_guest_token($1)', [g.id]));
    expect(rows[0].token).not.toBe(g.token);
    expect(rows[0].claimed_at).toBeNull();
    const creds = await db.query('select 1 from guest_credentials where guest_id = $1', [g.id]);
    expect(creds.rows).toHaveLength(0);

    const old = await anon(() => db.query('select * from get_guest_by_token($1)', [g.token]));
    expect(old.rows).toHaveLength(0);
    const fresh = await anon(() => db.query('select * from get_guest_by_token($1)', [rows[0].token]));
    expect(fresh.rows).toHaveLength(1);
  });

  it('solo el dueno del evento; anon no puede', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');
    const stranger = await createUser(db, 'otro@example.com');

    await expect(
      asUser(db, stranger, () => db.query('select * from regenerate_guest_token($1)', [g.id])),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(anon(() => db.query('select * from regenerate_guest_token($1)', [g.id]))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      asUser(db, owner, () =>
        db.query('select * from regenerate_guest_token($1)', ['00000000-0000-0000-0000-000000000000']),
      ),
    ).rejects.toMatchObject({ code: 'P0002' });
  });
});
