import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyMigrations, asRole, createSupabaseRoles } from './apply-migrations';
import { DATABASE_URL } from './db-config';

let admin: Client;

async function insertGuest(overrides: Partial<{ full_name: string; plus_ones_allowed: number }> = {}) {
  const full_name = overrides.full_name ?? 'Guest Test';
  const plus_ones_allowed = overrides.plus_ones_allowed ?? 2;

  const result = await admin.query<{ id: string; token: string }>(
    `insert into public.guests (full_name, plus_ones_allowed)
     values ($1, $2)
     returning id, token`,
    [full_name, plus_ones_allowed],
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

describe('check_in_guest', () => {
  it('marks checked_in_at for a valid token and returns the guest row', async () => {
    const guest = await insertGuest({ full_name: 'Ada Lovelace' });

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from check_in_guest($1)', [guest.token]),
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.full_name).toBe('Ada Lovelace');
    expect(row.checked_in_at).not.toBeNull();

    const stored = await admin.query('select checked_in_at from public.guests where id = $1', [guest.id]);
    expect(stored.rows[0].checked_in_at).not.toBeNull();
  });

  it('does not overwrite checked_in_at on a second scan, and does not error', async () => {
    const guest = await insertGuest();

    const first = await asRole(admin, 'anon', () =>
      admin.query('select * from check_in_guest($1)', [guest.token]),
    );
    const firstCheckedInAt = first.rows[0].checked_in_at;

    // Ensure a real time gap so an overwrite (if it happened) would be
    // detectable by a changed timestamp.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await asRole(admin, 'anon', () =>
      admin.query('select * from check_in_guest($1)', [guest.token]),
    );

    expect(second.rows).toHaveLength(1);
    expect(new Date(second.rows[0].checked_in_at).toISOString()).toBe(
      new Date(firstCheckedInAt).toISOString(),
    );
  });

  it('raises a clear exception for a token that matches no guest', async () => {
    await expect(
      asRole(admin, 'anon', () => admin.query('select * from check_in_guest($1)', ['this-token-does-not-exist'])),
    ).rejects.toThrow();
  });

  it('only checks in the guest matching the token, never another guest (isolation)', async () => {
    const guestA = await insertGuest({ full_name: 'Guest A' });
    const guestB = await insertGuest({ full_name: 'Guest B' });

    await asRole(admin, 'anon', () => admin.query('select * from check_in_guest($1)', [guestA.token]));

    const bRow = await admin.query('select checked_in_at from public.guests where id = $1', [guestB.id]);
    expect(bRow.rows[0].checked_in_at).toBeNull();

    const aRow = await admin.query('select checked_in_at from public.guests where id = $1', [guestA.id]);
    expect(aRow.rows[0].checked_in_at).not.toBeNull();
  });
});
