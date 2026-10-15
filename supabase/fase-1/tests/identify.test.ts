import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import {
  asAnon,
  asServiceRole,
  asUser,
  connect,
  createEvent,
  createGuest,
  createUser,
  resetAndMigrate,
} from './helpers';

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

beforeEach(async () => {
  await db.query('delete from public.identify_attempts');
});

const identify = (slug: string, name: string, ip?: string) =>
  asAnon(db, () => db.query('select * from identify_guest($1, $2)', [slug, name]), ip);

describe('name_tokens', () => {
  it('normaliza tildes, mayusculas, signos, particulas e iniciales', async () => {
    const { rows } = await db.query(
      `select name_tokens('  María  de los Ángeles, PÉREZ-Soto J. ') as t`,
    );
    expect(rows[0].t).toEqual(['angeles', 'maria', 'perez', 'soto']);
  });
});

describe('invitados: nombre y apellido obligatorios', () => {
  it('rechaza un invitado con una sola palabra', async () => {
    const ev = await createEvent(db, owner);
    await expect(createGuest(db, ev.id, 'Madonna')).rejects.toThrow(/guests_name_has_first_and_last/);
  });

  it('rechaza dos invitados con las mismas palabras en el mismo evento', async () => {
    const ev = await createEvent(db, owner);
    await createGuest(db, ev.id, 'Juan Pérez');
    await expect(createGuest(db, ev.id, 'perez JUAN')).rejects.toThrow(/guests_event_name_key/);
  });

  it('permite el mismo nombre en eventos distintos', async () => {
    const a = await createEvent(db, owner);
    const b = await createEvent(db, owner);
    await createGuest(db, a.id, 'Juan Pérez');
    await expect(createGuest(db, b.id, 'Juan Pérez')).resolves.toBeDefined();
  });
});

describe('identify_guest: lista cerrada', () => {
  it('entrega el token si el nombre esta en la lista (sin tildes ni orden)', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'list' });
    const guest = await createGuest(db, ev.id, 'María José Pérez Soto');

    const { rows } = await identify(ev.slug, 'perez maria');

    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('ok');
    expect(rows[0].guest_token).toBe(guest.token);
    expect(rows[0].guest_id).toBe(guest.id);
  });

  it('marca claimed_at la primera vez y no lo pisa despues', async () => {
    const ev = await createEvent(db, owner);
    const guest = await createGuest(db, ev.id, 'Ana Rojas');

    await identify(ev.slug, 'Ana Rojas');
    const first = await db.query('select claimed_at from guests where id = $1', [guest.id]);
    expect(first.rows[0].claimed_at).not.toBeNull();

    await identify(ev.slug, 'Ana Rojas');
    const second = await db.query('select claimed_at from guests where id = $1', [guest.id]);
    expect(second.rows[0].claimed_at).toEqual(first.rows[0].claimed_at);
  });

  it('devuelve not_found sin token si no esta en la lista', async () => {
    const ev = await createEvent(db, owner);
    await createGuest(db, ev.id, 'Ana Rojas');

    const { rows } = await identify(ev.slug, 'Pedro Pascal');

    expect(rows[0].outcome).toBe('not_found');
    expect(rows[0].guest_token).toBeNull();
    expect(await db.query('select count(*)::int as n from guests where event_id = $1', [ev.id]))
      .toMatchObject({ rows: [{ n: 1 }] });
  });

  it('devuelve ambiguous si varias personas coinciden', async () => {
    const ev = await createEvent(db, owner);
    await createGuest(db, ev.id, 'Juan Pérez González');
    await createGuest(db, ev.id, 'Juan Pérez Soto');

    const { rows } = await identify(ev.slug, 'Juan Pérez');
    expect(rows[0].outcome).toBe('ambiguous');
    expect(rows[0].guest_token).toBeNull();

    const resolved = await identify(ev.slug, 'Juan Pérez Soto');
    expect(resolved.rows[0].outcome).toBe('ok');
  });

  it('exige nombre y apellido', async () => {
    const ev = await createEvent(db, owner);
    await createGuest(db, ev.id, 'Ana Rojas');
    await expect(identify(ev.slug, 'Ana')).rejects.toThrow(/first name and last name/);
    await expect(identify(ev.slug, 'a b')).rejects.toThrow(/first name and last name/);
  });

  it('no encuentra invitados de otro evento', async () => {
    const a = await createEvent(db, owner);
    const b = await createEvent(db, owner);
    await createGuest(db, b.id, 'Ana Rojas');

    const { rows } = await identify(a.slug, 'Ana Rojas');
    expect(rows[0].outcome).toBe('not_found');
  });

  it('un slug inexistente falla con P0002', async () => {
    await expect(identify('no-existe-xxxx', 'Ana Rojas')).rejects.toMatchObject({ code: 'P0002' });
  });

  it('no deja entrar a un invitado rechazado', async () => {
    const ev = await createEvent(db, owner);
    await createGuest(db, ev.id, 'Ana Rojas', { approval_status: 'rejected' });
    const { rows } = await identify(ev.slug, 'Ana Rojas');
    expect(rows[0].outcome).toBe('not_found');
  });
});

describe('identify_guest: lista + solicitudes', () => {
  it('crea una solicitud pendiente, sin token, e idempotente', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'list_requests' });

    const first = await identify(ev.slug, 'Pedro Pascal');
    expect(first.rows[0].outcome).toBe('pending_approval');
    expect(first.rows[0].guest_token).toBeNull();

    const again = await identify(ev.slug, 'Pedro Pascal');
    expect(again.rows[0].outcome).toBe('pending_approval');

    const { rows } = await db.query(
      `select approval_status from guests where event_id = $1 and full_name = 'Pedro Pascal'`,
      [ev.id],
    );
    expect(rows).toEqual([{ approval_status: 'pending' }]);
  });

  it('entrega el token cuando el organizador aprueba', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'list_requests' });
    await identify(ev.slug, 'Pedro Pascal');
    await db.query(`update guests set approval_status = 'approved' where event_id = $1`, [ev.id]);

    const { rows } = await identify(ev.slug, 'Pedro Pascal');
    expect(rows[0].outcome).toBe('ok');
    expect(rows[0].guest_token).toBeTruthy();
  });

  it('un invitado pendiente no puede usar las RPC con su token', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'list_requests' });
    const pending = await createGuest(db, ev.id, 'Pedro Pascal', { approval_status: 'pending' });

    const { rows } = await asAnon(db, () =>
      db.query('select * from get_guest_by_token($1)', [pending.token]),
    );
    expect(rows).toHaveLength(0);
  });
});

describe('identify_guest: abierto', () => {
  it('da de alta al invitado y lo reutiliza con el mismo nombre', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });

    const first = await identify(ev.slug, 'Lucía Fernández');
    expect(first.rows[0].outcome).toBe('ok');
    expect(first.rows[0].guest_token).toBeTruthy();

    const again = await identify(ev.slug, 'fernandez lucia');
    expect(again.rows[0].guest_token).toBe(first.rows[0].guest_token);
  });

  it('no confunde "Ana Soto" con "Ana Soto Pérez" (coincidencia exacta)', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    const long = await identify(ev.slug, 'Ana Soto Pérez');
    const short = await identify(ev.slug, 'Ana Soto');
    expect(short.rows[0].guest_token).not.toBe(long.rows[0].guest_token);
  });
});

describe('identify_guest: freno de intentos', () => {
  it('bloquea tras 10 fallos desde la misma IP, pero no a otra IP', async () => {
    const ev = await createEvent(db, owner);
    await createGuest(db, ev.id, 'Ana Rojas');

    for (let i = 0; i < 10; i++) {
      const { rows } = await identify(ev.slug, 'Pedro Pascal', '10.0.0.1');
      expect(rows[0].outcome).toBe('not_found');
    }

    await expect(identify(ev.slug, 'Ana Rojas', '10.0.0.1')).rejects.toMatchObject({ code: '53400' });

    const other = await identify(ev.slug, 'Ana Rojas', '10.0.0.2');
    expect(other.rows[0].outcome).toBe('ok');
  });

  it('un acierto no consume intentos', async () => {
    const ev = await createEvent(db, owner);
    await createGuest(db, ev.id, 'Ana Rojas');
    for (let i = 0; i < 15; i++) {
      const { rows } = await identify(ev.slug, 'Ana Rojas', '10.0.0.3');
      expect(rows[0].outcome).toBe('ok');
    }
  });

  it('limita por evento aunque cambie la IP', async () => {
    const ev = await createEvent(db, owner);
    await createGuest(db, ev.id, 'Ana Rojas');
    for (let i = 0; i < 60; i++) {
      await identify(ev.slug, 'Pedro Pascal', `10.1.${Math.floor(i / 250)}.${i % 250}`);
    }
    await expect(identify(ev.slug, 'Ana Rojas', '10.9.9.9')).rejects.toMatchObject({ code: '53400' });
  });
});

describe('RUT: nunca se guarda y solo entra por el camino verificado', () => {
  it('identify_guest rechaza eventos con identifier = rut_lookup', async () => {
    const ev = await createEvent(db, owner, { identifier: 'rut_lookup' });
    await createGuest(db, ev.id, 'Ana Rojas');
    await expect(identify(ev.slug, 'Ana Rojas')).rejects.toMatchObject({ code: '42501' });
  });

  it('identify_guest_verified acepta el nombre legal completo (contencion inversa)', async () => {
    const ev = await createEvent(db, owner, { identifier: 'rut_lookup' });
    const guest = await createGuest(db, ev.id, 'Juan Pérez');

    const { rows } = await asServiceRole(db, () =>
      db.query('select * from identify_guest_verified($1, $2)', [ev.id, 'JUAN CARLOS PEREZ GONZALEZ']),
    );
    expect(rows[0].outcome).toBe('ok');
    expect(rows[0].guest_token).toBe(guest.token);
  });

  it('identify_guest_verified: not_found si el nombre legal no contiene al invitado', async () => {
    const ev = await createEvent(db, owner, { identifier: 'rut_lookup' });
    await createGuest(db, ev.id, 'Juan Pérez');

    const { rows } = await asServiceRole(db, () =>
      db.query('select * from identify_guest_verified($1, $2)', [ev.id, 'PEDRO PABLO PASCAL ROJAS']),
    );
    expect(rows[0].outcome).toBe('not_found');
  });

  it('identify_guest_verified falla en eventos que identifican por nombre', async () => {
    const ev = await createEvent(db, owner, { identifier: 'name' });
    await createGuest(db, ev.id, 'Juan Pérez');
    await expect(
      asServiceRole(db, () => db.query('select * from identify_guest_verified($1, $2)', [ev.id, 'Juan Pérez'])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('anon y authenticated NO pueden ejecutar identify_guest_verified ni el nucleo', async () => {
    const ev = await createEvent(db, owner, { identifier: 'rut_lookup' });
    await expect(
      asAnon(db, () => db.query('select * from identify_guest_verified($1, $2)', [ev.id, 'Ana Rojas'])),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asUser(db, owner, () => db.query('select * from identify_guest_verified($1, $2)', [ev.id, 'Ana Rojas'])),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asAnon(db, () => db.query('select * from _identify_core($1, $2, true)', [ev.id, 'Ana Rojas'])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('ninguna columna del esquema publico guarda un RUT', async () => {
    const { rows } = await db.query(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and column_name ~* '(rut|run|dni|documento)'
    `);
    expect(rows).toEqual([]);
  });
});
