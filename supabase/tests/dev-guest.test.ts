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

  const result = await admin.query<{ id: string; token: string }>(
    `insert into public.guests (full_name, status, plus_ones_allowed, plus_ones_confirmed)
     values ($1, $2, $3, $4)
     returning id, token`,
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

// Other test files in this suite (photos/rsvp/posts) leave guests behind
// without cleaning up, and file order is not guaranteed. Clear every
// non-dev guest before each test here so headcount assertions aren't
// polluted by leftovers -- but never delete the dev guest itself (it's
// seeded once by the migration in beforeAll, not re-seeded per test).
beforeEach(async () => {
  await admin.query('delete from public.guests where is_dev = false');
});

describe('dev guest seed', () => {
  it('creates a guests row with token = dev-preview and is_dev = true', async () => {
    const result = await admin.query(
      `select token, is_dev, full_name from public.guests where token = 'dev-preview'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].is_dev).toBe(true);
    expect(result.rows[0].full_name).toBe('DEV Preview');
  });
});

describe('get_public_headcount excludes the dev guest', () => {
  it('does not count the dev guest even when confirmed with plus_ones_confirmed > 0', async () => {
    await admin.query(
      `update public.guests set status = 'confirmed', plus_ones_confirmed = 5 where token = 'dev-preview'`,
    );
    await insertGuest({ status: 'confirmed', plus_ones_allowed: 1, plus_ones_confirmed: 1 });

    const result = await asRole(admin, 'anon', () =>
      admin.query('select public.get_public_headcount()'),
    );

    // Only the normal confirmed guest counts: 1 + 1 = 2. If the dev guest
    // (1 + 5 = 6) leaked in, this would be 8.
    expect(result.rows[0].get_public_headcount).toBe(2);
  });
});

describe('dev_reset_guest', () => {
  it('lets anon reset the dev guest back to a clean pending state', async () => {
    await admin.query(
      `update public.guests
       set status = 'confirmed', plus_ones_confirmed = 3, guest_note = 'test note', responded_at = now(), checked_in_at = now()
       where token = 'dev-preview'`,
    );

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from public.dev_reset_guest($1)', ['dev-preview']),
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.status).toBe('pending');
    expect(row.plus_ones_confirmed).toBe(0);
    expect(row.guest_note).toBeNull();
    expect(row.responded_at).toBeNull();
    expect(row.checked_in_at).toBeNull();
  });

  it('does not change a normal (non-dev) guest, even when called with their exact token', async () => {
    const guest = await insertGuest({
      full_name: 'Invitade Normal',
      status: 'confirmed',
      plus_ones_allowed: 2,
      plus_ones_confirmed: 2,
    });
    await admin.query(`update public.guests set checked_in_at = now() where id = $1`, [guest.id]);
    await admin.query(
      `insert into public.photos (guest_id, storage_path) values ($1, $2)`,
      [guest.id, `${guest.token}/keep-me.jpg`],
    );

    await asRole(admin, 'anon', () => admin.query('select * from public.dev_reset_guest($1)', [guest.token]));

    const stored = await admin.query(
      `select status, plus_ones_confirmed, checked_in_at from public.guests where id = $1`,
      [guest.id],
    );
    expect(stored.rows[0].status).toBe('confirmed');
    expect(stored.rows[0].plus_ones_confirmed).toBe(2);
    expect(stored.rows[0].checked_in_at).not.toBeNull();

    const photos = await admin.query(`select id from public.photos where guest_id = $1`, [guest.id]);
    expect(photos.rows).toHaveLength(1);
  });
});
