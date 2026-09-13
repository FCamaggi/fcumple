import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyMigrations, asRole, createSupabaseRoles } from './apply-migrations';
import { DATABASE_URL } from './db-config';

let admin: Client;

// Inserts a guest directly as the migration-owning superuser (bypasses RLS,
// which is appropriate here: this is test fixture setup, not the behavior
// under test) and returns its token + id for use in assertions.
async function insertGuest(overrides: Partial<{
  full_name: string;
  plus_ones_allowed: number;
  admin_note: string;
}> = {}) {
  const full_name = overrides.full_name ?? 'Guest Test';
  const plus_ones_allowed = overrides.plus_ones_allowed ?? 2;
  const admin_note = overrides.admin_note ?? null;

  const result = await admin.query<{ id: string; token: string }>(
    `insert into public.guests (full_name, plus_ones_allowed, admin_note)
     values ($1, $2, $3)
     returning id, token`,
    [full_name, plus_ones_allowed, admin_note],
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

describe('get_guest_by_token', () => {
  it('returns the guest data for a valid token, without admin_note', async () => {
    const guest = await insertGuest({ full_name: 'Ada Lovelace', plus_ones_allowed: 3, admin_note: 'secret vip note' });

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from get_guest_by_token($1)', [guest.token]),
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.full_name).toBe('Ada Lovelace');
    expect(row.status).toBe('pending');
    expect(row.plus_ones_allowed).toBe(3);
    expect(row.plus_ones_confirmed).toBe(0);
    expect(row).not.toHaveProperty('admin_note');
  });

  it('returns no rows for a token that does not exist', async () => {
    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from get_guest_by_token($1)', ['this-token-does-not-exist']),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('returns no rows for an empty token, same as a nonexistent one', async () => {
    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from get_guest_by_token($1)', ['']),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('reflects the real checked_in_at once the door scanner has checked the guest in', async () => {
    const guest = await insertGuest();

    // Before any scan: the guest-facing RPC must report no check-in yet.
    const before = await asRole(admin, 'anon', () =>
      admin.query('select * from get_guest_by_token($1)', [guest.token]),
    );
    expect(before.rows[0].checked_in_at).toBeNull();

    await asRole(admin, 'anon', () => admin.query('select * from check_in_guest($1)', [guest.token]));

    const after = await asRole(admin, 'anon', () =>
      admin.query('select * from get_guest_by_token($1)', [guest.token]),
    );
    expect(after.rows[0].checked_in_at).not.toBeNull();
  });
});

describe('submit_rsvp', () => {
  it('updates the matching guest when status is confirmed', async () => {
    const guest = await insertGuest({ plus_ones_allowed: 2 });

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from submit_rsvp($1, $2, $3, $4)', [guest.token, 'confirmed', 1, 'llego temprano']),
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.status).toBe('confirmed');
    expect(row.plus_ones_confirmed).toBe(1);
    expect(row.guest_note).toBe('llego temprano');
    expect(row.responded_at).not.toBeNull();
  });

  it('rejects status = pending with an error', async () => {
    const guest = await insertGuest();

    await expect(
      asRole(admin, 'anon', () =>
        admin.query('select * from submit_rsvp($1, $2, $3, $4)', [guest.token, 'pending', 0, null]),
      ),
    ).rejects.toThrow();
  });

  it('rejects any status other than confirmed/declined', async () => {
    const guest = await insertGuest();

    await expect(
      asRole(admin, 'anon', () =>
        admin.query('select * from submit_rsvp($1, $2, $3, $4)', [guest.token, 'maybe', 0, null]),
      ),
    ).rejects.toThrow();
  });

  it('rejects plus_ones greater than plus_ones_allowed', async () => {
    const guest = await insertGuest({ plus_ones_allowed: 1 });

    await expect(
      asRole(admin, 'anon', () =>
        admin.query('select * from submit_rsvp($1, $2, $3, $4)', [guest.token, 'confirmed', 2, null]),
      ),
    ).rejects.toThrow();
  });

  it('keeps reporting checked_in_at after the guest edits their RSVP post-check-in', async () => {
    const guest = await insertGuest({ plus_ones_allowed: 2 });
    await asRole(admin, 'anon', () => admin.query('select * from check_in_guest($1)', [guest.token]));

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from submit_rsvp($1, $2, $3, $4)', [guest.token, 'confirmed', 1, null]),
    );

    expect(result.rows[0].checked_in_at).not.toBeNull();
  });

  it('only updates the guest matching the token, never another guest (isolation)', async () => {
    const guestA = await insertGuest({ full_name: 'Guest A', plus_ones_allowed: 2 });
    const guestB = await insertGuest({ full_name: 'Guest B', plus_ones_allowed: 2 });

    await asRole(admin, 'anon', () =>
      admin.query('select * from submit_rsvp($1, $2, $3, $4)', [guestA.token, 'confirmed', 1, null]),
    );

    const bRow = await admin.query('select status, plus_ones_confirmed, responded_at from public.guests where id = $1', [guestB.id]);
    expect(bRow.rows[0].status).toBe('pending');
    expect(bRow.rows[0].plus_ones_confirmed).toBe(0);
    expect(bRow.rows[0].responded_at).toBeNull();

    const aRow = await admin.query('select status, plus_ones_confirmed from public.guests where id = $1', [guestA.id]);
    expect(aRow.rows[0].status).toBe('confirmed');
    expect(aRow.rows[0].plus_ones_confirmed).toBe(1);
  });
});

describe('RLS on guests', () => {
  it('does not let anon select rows directly from guests', async () => {
    await insertGuest();
    await expect(
      asRole(admin, 'anon', () => admin.query('select * from public.guests')),
    ).rejects.toThrow();
  });

  it('does not let anon update rows directly on guests', async () => {
    const guest = await insertGuest();
    await expect(
      asRole(admin, 'anon', () =>
        admin.query('update public.guests set status = $1 where id = $2', ['confirmed', guest.id]),
      ),
    ).rejects.toThrow();
  });

  it('lets authenticated select and update guests directly (admin access)', async () => {
    const guest = await insertGuest();

    const rows = await asRole(admin, 'authenticated', () => admin.query('select * from public.guests where id = $1', [guest.id]));
    expect(rows.rows).toHaveLength(1);

    await asRole(admin, 'authenticated', () =>
      admin.query('update public.guests set admin_note = $1 where id = $2', ['vip', guest.id]),
    );
    const updated = await admin.query('select admin_note from public.guests where id = $1', [guest.id]);
    expect(updated.rows[0].admin_note).toBe('vip');
  });
});

describe('RLS on event_config', () => {
  it('lets anon select event_config', async () => {
    await expect(
      asRole(admin, 'anon', () => admin.query('select * from public.event_config')),
    ).resolves.toBeDefined();
  });

  it('does not let anon insert/update event_config', async () => {
    await expect(
      asRole(admin, 'anon', () =>
        admin.query(
          `insert into public.event_config (id, event_name) values (true, 'x')
           on conflict (id) do update set event_name = excluded.event_name`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('lets authenticated upsert event_config', async () => {
    await asRole(admin, 'authenticated', () =>
      admin.query(
        `insert into public.event_config (id, event_name, location)
         values (true, 'Cumple', 'Casa')
         on conflict (id) do update set event_name = excluded.event_name, location = excluded.location`,
      ),
    );
    const row = await admin.query('select event_name, location from public.event_config where id = true');
    expect(row.rows[0].event_name).toBe('Cumple');
  });
});

describe('token generation', () => {
  it('never generates the same token for two guests, and it is not sequential/guessable', async () => {
    const a = await insertGuest();
    const b = await insertGuest();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(10);
    // Should not simply be a small increasing integer.
    expect(/^\d+$/.test(a.token)).toBe(false);
  });
});
