import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyMigrations, asRole, createSupabaseRoles } from './apply-migrations';
import { DATABASE_URL } from './db-config';

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await createSupabaseRoles(admin);
  await applyMigrations(admin);
});

afterAll(async () => {
  await admin.end();
});

beforeEach(async () => {
  await admin.query('delete from public.guests where is_dev = false');
});

describe('guests.phone', () => {
  it('is nullable and defaults to null on insert', async () => {
    const result = await admin.query<{ phone: string | null }>(
      `insert into public.guests (full_name) values ('Sin Teléfono') returning phone`,
    );
    expect(result.rows[0].phone).toBeNull();
  });

  it('stores whatever the admin types, with no format constraint', async () => {
    const result = await admin.query<{ phone: string | null }>(
      `insert into public.guests (full_name, phone) values ('Con Teléfono', '+56 (9) 1234-5678') returning phone`,
    );
    expect(result.rows[0].phone).toBe('+56 (9) 1234-5678');
  });

  it('is readable and writable by the authenticated admin role', async () => {
    const inserted = await admin.query<{ id: string }>(
      `insert into public.guests (full_name) values ('Editable') returning id`,
    );
    const id = inserted.rows[0].id;

    await asRole(admin, 'authenticated', () =>
      admin.query(`update public.guests set phone = $1 where id = $2`, ['987654321', id]),
    );

    const read = await asRole(admin, 'authenticated', () =>
      admin.query<{ phone: string | null }>(`select phone from public.guests where id = $1`, [id]),
    );
    expect(read.rows[0].phone).toBe('987654321');
  });

  // El teléfono es un dato sensible que solo el admin necesita: las RPCs
  // guest-facing (docs/05-comunicacion/sistema-de-mensajes.md) no deben
  // filtrarlo nunca al propio invitado.
  it('is never returned by get_guest_by_token', async () => {
    const inserted = await admin.query<{ token: string }>(
      `insert into public.guests (full_name, phone) values ('Con Teléfono', '987654321') returning token`,
    );
    const token = inserted.rows[0].token;

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from public.get_guest_by_token($1)', [token]),
    );

    expect(result.rows[0]).not.toHaveProperty('phone');
  });
});
