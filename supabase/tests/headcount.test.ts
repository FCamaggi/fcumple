import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyMigrations, asRole, createSupabaseRoles } from './apply-migrations';
import { DATABASE_URL } from './db-config';

let admin: Client;

async function insertGuest(overrides: Partial<{
  full_name: string;
  status: 'pending' | 'confirmed' | 'declined';
  plus_ones_allowed: number;
  plus_ones_confirmed: number;
}> = {}) {
  const full_name = overrides.full_name ?? 'Invitade de prueba';
  const status = overrides.status ?? 'pending';
  const plus_ones_allowed = overrides.plus_ones_allowed ?? 0;
  const plus_ones_confirmed = overrides.plus_ones_confirmed ?? 0;

  const result = await admin.query<{ id: string }>(
    `insert into public.guests (full_name, status, plus_ones_allowed, plus_ones_confirmed)
     values ($1, $2, $3, $4)
     returning id`,
    [full_name, status, plus_ones_allowed, plus_ones_confirmed],
  );
  return result.rows[0];
}

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
  await admin.query('delete from public.guests');
});

describe('get_public_headcount', () => {
  it('lets anon call the RPC and get the correct total', async () => {
    await insertGuest({ status: 'confirmed', plus_ones_allowed: 2, plus_ones_confirmed: 2 });
    await insertGuest({ status: 'confirmed', plus_ones_allowed: 1, plus_ones_confirmed: 0 });
    await insertGuest({ status: 'confirmed', plus_ones_allowed: 3, plus_ones_confirmed: 1 });

    const result = await asRole(admin, 'anon', () =>
      admin.query('select public.get_public_headcount()'),
    );

    // (1 + 2) + (1 + 0) + (1 + 1) = 6
    expect(result.rows[0].get_public_headcount).toBe(6);
  });

  it('excludes pending and declined guests from the count', async () => {
    await insertGuest({ status: 'confirmed', plus_ones_allowed: 1, plus_ones_confirmed: 1 });
    await insertGuest({ status: 'pending', plus_ones_allowed: 5, plus_ones_confirmed: 5 });
    await insertGuest({ status: 'declined', plus_ones_allowed: 5, plus_ones_confirmed: 5 });

    const result = await asRole(admin, 'anon', () =>
      admin.query('select public.get_public_headcount()'),
    );

    // Only the confirmed guest counts: 1 + 1 = 2
    expect(result.rows[0].get_public_headcount).toBe(2);
  });

  it('still does not let anon read public.guests directly', async () => {
    await insertGuest({ status: 'confirmed' });

    await expect(
      asRole(admin, 'anon', () => admin.query('select * from public.guests')),
    ).rejects.toThrow();
  });
});
