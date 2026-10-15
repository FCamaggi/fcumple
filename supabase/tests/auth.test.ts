import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

beforeEach(async () => {
  await db.query('delete from public.identify_attempts');
});

const register = (slug: string, name: string, pin: string, ip?: string) =>
  asAnon(db, () => db.query('select * from register_guest($1, $2, $3)', [slug, name, pin]), ip);

const login = (slug: string, name: string, pin: string, ip?: string) =>
  asAnon(db, () => db.query('select * from login_guest($1, $2, $3)', [slug, name, pin]), ip);

describe('name_tokens', () => {
  it('normaliza tildes, mayusculas, signos, particulas e iniciales', async () => {
    const { rows } = await db.query(`select name_tokens('  María  de los Ángeles, PÉREZ-Soto J. ') as t`);
    expect(rows[0].t).toEqual(['angeles', 'maria', 'perez', 'soto']);
  });
});

describe('invitados: nombre y apellido obligatorios', () => {
  it('rechaza un invitado con una sola palabra', async () => {
    const ev = await createEvent(db, owner);
    await expect(createGuest(db, ev.id, 'Madonna')).rejects.toThrow(/guests_name_has_first_and_last/);
  });

  it('rechaza dos invitados con las mismas palabras en el mismo evento, pero no en eventos distintos', async () => {
    const a = await createEvent(db, owner);
    const b = await createEvent(db, owner);
    await createGuest(db, a.id, 'Juan Pérez');
    await expect(createGuest(db, a.id, 'perez JUAN')).rejects.toThrow(/guests_event_name_key/);
    await expect(createGuest(db, b.id, 'Juan Pérez')).resolves.toBeDefined();
  });
});

describe('register_guest: evento abierto', () => {
  it('inscribe a la persona con su nombre y PIN, y entrega el token', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    const { rows } = await register(ev.slug, 'Lucía  Fernández', '4821');

    expect(rows[0].outcome).toBe('ok');
    expect(rows[0].guest_token).toBeTruthy();
    expect(rows[0].guest_name).toBe('Lucía Fernández');

    const guest = await db.query('select approval_status, claimed_at from guests where id = $1', [rows[0].guest_id]);
    expect(guest.rows[0].approval_status).toBe('approved');
    expect(guest.rows[0].claimed_at).not.toBeNull();
  });

  it('guarda el PIN solo como hash bcrypt, nunca en claro', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    const { rows } = await register(ev.slug, 'Lucía Fernández', '4821');
    const cred = await db.query('select pin_hash from guest_credentials where guest_id = $1', [rows[0].guest_id]);
    expect(cred.rows[0].pin_hash).toMatch(/^\$2[aby]\$/);
    expect(cred.rows[0].pin_hash).not.toContain('4821');
  });

  it('dice name_taken si ya hay alguien inscrito con ese nombre (en cualquier orden)', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await register(ev.slug, 'Ana Soto', '1111');
    const again = await register(ev.slug, 'soto ANA', '2222');
    expect(again.rows[0].outcome).toBe('name_taken');
    expect(again.rows[0].guest_token).toBeNull();
  });

  it('"Ana Soto" y "Ana Soto Pérez" son personas distintas', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    const long = await register(ev.slug, 'Ana Soto Pérez', '1111');
    const short = await register(ev.slug, 'Ana Soto', '2222');
    expect(short.rows[0].outcome).toBe('ok');
    expect(short.rows[0].guest_id).not.toBe(long.rows[0].guest_id);
  });

  it.each([
    ['Ana', '1234', /first name and last name/],
    ['a b', '1234', /first name and last name/],
    ['Ana Soto', '123', /pin must be 4 to 6 digits/],
    ['Ana Soto', '1234567', /pin must be 4 to 6 digits/],
    ['Ana Soto', 'abcd', /pin must be 4 to 6 digits/],
  ])('rechaza datos invalidos (%j / %j)', async (name, pin, message) => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await expect(register(ev.slug, name, pin)).rejects.toThrow(message);
  });

  it('un slug inexistente falla con P0002', async () => {
    await expect(register('no-existe-xxxx', 'Ana Soto', '1234')).rejects.toMatchObject({ code: 'P0002' });
  });

  it('permite volver a inscribirse a quien el organizador dejo sin PIN (restablecer acceso)', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    const first = await register(ev.slug, 'Ana Soto', '1111');
    await asUser(db, owner, () => db.query('select * from regenerate_guest_token($1)', [first.rows[0].guest_id]));

    const second = await register(ev.slug, 'Ana Soto', '9999');
    expect(second.rows[0].outcome).toBe('ok');
    expect(second.rows[0].guest_id).toBe(first.rows[0].guest_id);
    expect(second.rows[0].guest_token).not.toBe(first.rows[0].guest_token);

    expect((await login(ev.slug, 'Ana Soto', '1111')).rows[0].outcome).toBe('invalid');
    expect((await login(ev.slug, 'Ana Soto', '9999')).rows[0].outcome).toBe('ok');
  });

  it('no deja inscribir a un invitado rechazado', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await createGuest(db, ev.id, 'Ana Soto', { approval_status: 'rejected' });
    expect((await register(ev.slug, 'Ana Soto', '1234')).rows[0].outcome).toBe('name_taken');
  });

  it('tiene un tope de 500 invitados por evento', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await db.query(
      `insert into guests (event_id, full_name)
       select $1, 'Persona x' || chr(97 + (g / 26)) || chr(97 + (g % 26)) || ' Apellido'
       from generate_series(0, 499) g`,
      [ev.id],
    );
    await expect(register(ev.slug, 'Ana Soto', '1234')).rejects.toMatchObject({ code: '53400' });
  });

  it('una fiesta entera desde el mismo wifi puede inscribirse sin bloquearse', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    for (let i = 0; i < 80; i++) {
      const name = `Invitado${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))} Fiesta`;
      const { rows } = await register(ev.slug, name, '1234', '190.1.2.3');
      expect(rows[0].outcome).toBe('ok');
    }
  });
});

describe('register_guest: con lista', () => {
  it('lista cerrada: la persona elige su PIN la primera vez; no inscribe a desconocidos', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'list' });
    const listed = await createGuest(db, ev.id, 'María José Pérez Soto');

    const unknown = await register(ev.slug, 'Pedro Pascal', '1234');
    expect(unknown.rows[0].outcome).toBe('not_found');

    const ok = await register(ev.slug, 'perez maria', '4321');
    expect(ok.rows[0].outcome).toBe('ok');
    expect(ok.rows[0].guest_token).toBe(listed.token);

    const again = await register(ev.slug, 'perez maria', '0000');
    expect(again.rows[0].outcome).toBe('name_taken');
  });

  it('lista: ambiguous si varias personas coinciden', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'list' });
    await createGuest(db, ev.id, 'Juan Pérez González');
    await createGuest(db, ev.id, 'Juan Pérez Soto');
    expect((await register(ev.slug, 'Juan Pérez', '1234')).rows[0].outcome).toBe('ambiguous');
    expect((await register(ev.slug, 'Juan Pérez Soto', '1234')).rows[0].outcome).toBe('ok');
  });

  it('lista + solicitudes: queda pendiente, sin token, y entra cuando el organizador aprueba', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'list_requests' });

    const request = await register(ev.slug, 'Pedro Pascal', '1234');
    expect(request.rows[0].outcome).toBe('pending_approval');
    expect(request.rows[0].guest_token).toBeNull();

    // Con el PIN correcto se informa que sigue pendiente; con uno malo, nada.
    expect((await login(ev.slug, 'Pedro Pascal', '1234')).rows[0].outcome).toBe('pending_approval');
    expect((await login(ev.slug, 'Pedro Pascal', '9999')).rows[0].outcome).toBe('invalid');

    await db.query(`update guests set approval_status = 'approved' where event_id = $1`, [ev.id]);
    const entered = await login(ev.slug, 'Pedro Pascal', '1234');
    expect(entered.rows[0].outcome).toBe('ok');
    expect(entered.rows[0].guest_token).toBeTruthy();
  });

  it('un invitado pendiente no puede usar las RPC con su token', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'list_requests' });
    const pending = await createGuest(db, ev.id, 'Pedro Pascal', { approval_status: 'pending' });
    const { rows } = await asAnon(db, () => db.query('select * from get_guest_by_token($1)', [pending.token]));
    expect(rows).toHaveLength(0);
  });
});

describe('login_guest', () => {
  it('entra con nombre (parcial, sin tildes ni orden) y PIN, y devuelve el mismo token', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    const reg = await register(ev.slug, 'María José Pérez Soto', '4821');

    const { rows } = await login(ev.slug, 'perez MARIA', '4821');
    expect(rows[0].outcome).toBe('ok');
    expect(rows[0].guest_token).toBe(reg.rows[0].guest_token);
  });

  it('un PIN equivocado y un nombre inexistente dan la misma respuesta', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await register(ev.slug, 'Ana Soto', '4821');

    const wrongPin = await login(ev.slug, 'Ana Soto', '0000');
    const unknown = await login(ev.slug, 'Pedro Pascal', '4821');
    expect(wrongPin.rows[0]).toEqual({ outcome: 'invalid', guest_token: null, guest_id: null, guest_name: null });
    expect(unknown.rows[0]).toEqual(wrongPin.rows[0]);
  });

  it('bloquea 10 minutos tras 5 PIN equivocados seguidos, aunque despues acierte', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    const reg = await register(ev.slug, 'Ana Soto', '4821');

    for (let i = 0; i < 5; i++) {
      expect((await login(ev.slug, 'Ana Soto', '0000')).rows[0].outcome).toBe('invalid');
    }
    expect((await login(ev.slug, 'Ana Soto', '4821')).rows[0].outcome).toBe('locked');

    // Pasado el bloqueo, el PIN correcto vuelve a funcionar.
    await db.query(`update guest_credentials set locked_until = now() - interval '1 second' where guest_id = $1`, [
      reg.rows[0].guest_id,
    ]);
    expect((await login(ev.slug, 'Ana Soto', '4821')).rows[0].outcome).toBe('ok');
  });

  it('un acierto reinicia la cuenta de fallos', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await register(ev.slug, 'Ana Soto', '4821');

    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) await login(ev.slug, 'Ana Soto', '0000');
      expect((await login(ev.slug, 'Ana Soto', '4821')).rows[0].outcome).toBe('ok');
    }
  });

  it('ambiguous si varias personas coinciden con lo escrito', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await register(ev.slug, 'Juan Pérez González', '1111');
    await register(ev.slug, 'Juan Pérez Soto', '2222');
    expect((await login(ev.slug, 'Juan Pérez', '1111')).rows[0].outcome).toBe('ambiguous');
    expect((await login(ev.slug, 'Juan Pérez Soto', '2222')).rows[0].outcome).toBe('ok');
  });

  it('needs_registration para quien el organizador cargo pero nunca eligio PIN', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'list' });
    await createGuest(db, ev.id, 'Ana Soto');
    expect((await login(ev.slug, 'Ana Soto', '1234')).rows[0].outcome).toBe('needs_registration');
  });

  it('no deja entrar a un invitado rechazado', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    const reg = await register(ev.slug, 'Ana Soto', '4821');
    await db.query(`update guests set approval_status = 'rejected' where id = $1`, [reg.rows[0].guest_id]);
    expect((await login(ev.slug, 'Ana Soto', '4821')).rows[0].outcome).toBe('invalid');
  });

  it('exige nombre y apellido y un PIN valido', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await expect(login(ev.slug, 'Ana', '1234')).rejects.toThrow(/first name and last name/);
    await expect(login(ev.slug, 'Ana Soto', '12')).rejects.toThrow(/pin must be 4 to 6 digits/);
  });

  it('un invitado de otro evento no se puede usar para entrar', async () => {
    const a = await createEvent(db, owner, { access_mode: 'open' });
    const b = await createEvent(db, owner, { access_mode: 'open' });
    await register(b.slug, 'Ana Soto', '4821');
    expect((await login(a.slug, 'Ana Soto', '4821')).rows[0].outcome).toBe('invalid');
  });
});

describe('freno de intentos', () => {
  it('bloquea tras 30 fallos desde la misma IP, pero no a otra IP', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await register(ev.slug, 'Ana Soto', '4821');

    for (let i = 0; i < 30; i++) {
      const name = `Nadie${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))} Existe`;
      expect((await login(ev.slug, name, '0000', '10.0.0.1')).rows[0].outcome).toBe('invalid');
    }
    await expect(login(ev.slug, 'Ana Soto', '4821', '10.0.0.1')).rejects.toMatchObject({ code: '53400' });
    expect((await login(ev.slug, 'Ana Soto', '4821', '10.0.0.2')).rows[0].outcome).toBe('ok');
  });

  it('los aciertos no consumen intentos', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await register(ev.slug, 'Ana Soto', '4821');
    for (let i = 0; i < 50; i++) {
      expect((await login(ev.slug, 'Ana Soto', '4821', '10.0.0.3')).rows[0].outcome).toBe('ok');
    }
  });

  it('limita por evento aunque cambie la IP', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await register(ev.slug, 'Ana Soto', '4821');
    await db.query(
      `insert into identify_attempts (event_id, client_key)
       select $1, 'ip-' || g from generate_series(1, 200) g`,
      [ev.id],
    );
    await expect(login(ev.slug, 'Ana Soto', '4821', '10.9.9.9')).rejects.toMatchObject({ code: '53400' });
  });
});

describe('secretos: nadie lee PIN ni hashes', () => {
  it('ni anon ni el organizador pueden leer guest_credentials', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await register(ev.slug, 'Ana Soto', '4821');
    await expect(asAnon(db, () => db.query('select * from guest_credentials'))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asUser(db, owner, () => db.query('select * from guest_credentials'))).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('el organizador ve a sus invitados sin ningun dato de credenciales', async () => {
    const ev = await createEvent(db, owner, { access_mode: 'open' });
    await register(ev.slug, 'Ana Soto', '4821');
    const { rows } = await asUser(db, owner, () => db.query('select * from guests where event_id = $1', [ev.id]));
    expect(JSON.stringify(rows)).not.toMatch(/\$2[aby]\$|pin/i);
  });

  it('las funciones internas no son ejecutables por anon ni authenticated', async () => {
    const ev = await createEvent(db, owner);
    for (const call of [
      `select _guard_attempts('${ev.id}', 'x')`,
      `select _record_failure('${ev.id}', 'x')`,
      `select _set_credentials('${ev.id}', '1234')`,
    ]) {
      await expect(asAnon(db, () => db.query(call))).rejects.toMatchObject({ code: '42501' });
      await expect(asUser(db, owner, () => db.query(call))).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('ninguna columna del esquema publico guarda un RUT, un telefono, un correo ni un PIN en claro', async () => {
    const { rows } = await db.query(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public'
        and (column_name ~* '(rut|run|dni|documento|phone|telefono|email|correo|password|clave)' or column_name = 'pin')
    `);
    expect(rows).toEqual([]);
  });
});
