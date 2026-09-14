import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyMigrations, asRole, createSupabaseRoles } from './apply-migrations';
import { DATABASE_URL } from './db-config';

let admin: Client;

async function insertGuest(overrides: Partial<{ full_name: string; plus_ones_allowed: number }> = {}) {
  const full_name = overrides.full_name ?? 'Guest Test';
  const plus_ones_allowed = overrides.plus_ones_allowed ?? 2;

  const result = await admin.query<{ id: string; token: string }>(
    `insert into public.guests (full_name, plus_ones_allowed, status)
     values ($1, $2, 'confirmed')
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

describe('guests_reset_checked_in_at trigger', () => {
  it('rolls back checked_in_at to null when a checked-in guest is edited back to pending (admin path)', async () => {
    const guest = await insertGuest();

    await asRole(admin, 'anon', () => admin.query('select * from check_in_guest($1)', [guest.token]));
    const afterCheckIn = await admin.query('select checked_in_at from public.guests where id = $1', [guest.id]);
    expect(afterCheckIn.rows[0].checked_in_at).not.toBeNull();

    // Mismo camino de escritura que updateGuest() en src/lib/adminApi.ts:
    // un update directo sobre la tabla como el rol authenticated.
    await asRole(admin, 'authenticated', () =>
      admin.query(`update public.guests set status = 'pending' where id = $1`, [guest.id]),
    );

    const afterEdit = await admin.query('select status, checked_in_at from public.guests where id = $1', [guest.id]);
    expect(afterEdit.rows[0].status).toBe('pending');
    expect(afterEdit.rows[0].checked_in_at).toBeNull();
  });

  it('rolls back checked_in_at to null when a checked-in guest edits their own rsvp to declined (submit_rsvp path)', async () => {
    const guest = await insertGuest();

    await asRole(admin, 'anon', () => admin.query('select * from check_in_guest($1)', [guest.token]));

    await asRole(admin, 'anon', () =>
      admin.query('select * from submit_rsvp($1, $2, $3, $4)', [guest.token, 'declined', 0, null]),
    );

    const row = await admin.query('select status, checked_in_at from public.guests where id = $1', [guest.id]);
    expect(row.rows[0].status).toBe('declined');
    expect(row.rows[0].checked_in_at).toBeNull();
  });

  it('leaves checked_in_at untouched when the guest stays confirmed', async () => {
    const guest = await insertGuest();

    await asRole(admin, 'anon', () => admin.query('select * from check_in_guest($1)', [guest.token]));
    const afterCheckIn = await admin.query('select checked_in_at from public.guests where id = $1', [guest.id]);
    const checkedInAt = afterCheckIn.rows[0].checked_in_at;

    await asRole(admin, 'authenticated', () =>
      admin.query(`update public.guests set plus_ones_confirmed = 1 where id = $1`, [guest.id]),
    );

    const row = await admin.query('select checked_in_at from public.guests where id = $1', [guest.id]);
    expect(new Date(row.rows[0].checked_in_at).toISOString()).toBe(new Date(checkedInAt).toISOString());
  });

  it('does nothing odd when checked_in_at was already null and status changes', async () => {
    const guest = await insertGuest();

    await asRole(admin, 'authenticated', () =>
      admin.query(`update public.guests set status = 'declined' where id = $1`, [guest.id]),
    );

    const row = await admin.query('select status, checked_in_at from public.guests where id = $1', [guest.id]);
    expect(row.rows[0].status).toBe('declined');
    expect(row.rows[0].checked_in_at).toBeNull();
  });
});
