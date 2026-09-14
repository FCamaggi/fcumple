import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyMigrations, asRole, createStorageSchema, createSupabaseRoles } from './apply-migrations';
import { DATABASE_URL } from './db-config';

let admin: Client;

async function insertGuest(overrides: Partial<{
  full_name: string;
  photo_quota: number;
}> = {}) {
  const full_name = overrides.full_name ?? 'Guest Test';
  const photo_quota = overrides.photo_quota ?? 5;

  const result = await admin.query<{ id: string; token: string }>(
    `insert into public.guests (full_name, photo_quota)
     values ($1, $2)
     returning id, token`,
    [full_name, photo_quota],
  );
  return result.rows[0];
}

async function insertPhoto(guestId: string, storagePath: string, status = 'pending') {
  const result = await admin.query<{ id: string }>(
    `insert into public.photos (guest_id, storage_path, status)
     values ($1, $2, $3)
     returning id`,
    [guestId, storagePath, status],
  );
  return result.rows[0];
}

beforeAll(async () => {
  admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await createSupabaseRoles(admin);
  await createStorageSchema(admin);
  await applyMigrations(admin);
});

afterAll(async () => {
  await admin.end();
});

beforeEach(async () => {
  await admin.query('delete from storage.objects');
  await admin.query('delete from public.photos');
  await admin.query('delete from public.guests');
  // event_config is a singleton row that migrations may have already
  // created; reset the reveal flag so tests don't leak state into each
  // other (a previous test revealing the roll must not affect the next).
  await admin.query(
    `insert into public.event_config (id, photos_revealed_at) values (true, null)
     on conflict (id) do update set photos_revealed_at = null`,
  );
});

describe('submit_photo', () => {
  it('inserts a pending row and returns it when the token is valid and quota is available', async () => {
    const guest = await insertGuest({ photo_quota: 5 });

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from submit_photo($1, $2)', [guest.token, `${guest.token}/photo1.jpg`]),
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.guest_id).toBe(guest.id);
    expect(row.storage_path).toBe(`${guest.token}/photo1.jpg`);
    expect(row.status).toBe('pending');
    expect(row.created_at).not.toBeNull();
  });

  it('rejects once the guest has reached photo_quota', async () => {
    const guest = await insertGuest({ photo_quota: 2 });
    await insertPhoto(guest.id, `${guest.token}/a.jpg`);
    await insertPhoto(guest.id, `${guest.token}/b.jpg`);

    await expect(
      asRole(admin, 'anon', () =>
        admin.query('select * from submit_photo($1, $2)', [guest.token, `${guest.token}/c.jpg`]),
      ),
    ).rejects.toThrow();
  });

  it('counts photos of any status (including rejected) against the quota', async () => {
    const guest = await insertGuest({ photo_quota: 2 });
    await insertPhoto(guest.id, `${guest.token}/a.jpg`, 'rejected');
    await insertPhoto(guest.id, `${guest.token}/b.jpg`, 'rejected');

    await expect(
      asRole(admin, 'anon', () =>
        admin.query('select * from submit_photo($1, $2)', [guest.token, `${guest.token}/c.jpg`]),
      ),
    ).rejects.toThrow();
  });

  it('rejects a storage_path that does not start with the caller token', async () => {
    const guest = await insertGuest();
    const otherGuest = await insertGuest({ full_name: 'Other Guest' });

    await expect(
      asRole(admin, 'anon', () =>
        admin.query('select * from submit_photo($1, $2)', [guest.token, `${otherGuest.token}/sneaky.jpg`]),
      ),
    ).rejects.toThrow();
  });

  it('rejects an unknown token', async () => {
    await expect(
      asRole(admin, 'anon', () =>
        admin.query('select * from submit_photo($1, $2)', ['no-such-token', 'no-such-token/x.jpg']),
      ),
    ).rejects.toThrow();
  });
});

describe('get_photo_quota', () => {
  it('returns quota and used count for a valid token', async () => {
    const guest = await insertGuest({ photo_quota: 5 });
    await insertPhoto(guest.id, `${guest.token}/a.jpg`, 'approved');
    await insertPhoto(guest.id, `${guest.token}/b.jpg`, 'pending');

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from get_photo_quota($1)', [guest.token]),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].quota).toBe(5);
    expect(result.rows[0].used).toBe(2);
  });

  it('returns no rows for an unknown token', async () => {
    const result = await asRole(admin, 'anon', () => admin.query('select * from get_photo_quota($1)', ['nope']));
    expect(result.rows).toHaveLength(0);
  });
});

describe('RLS on photos', () => {
  it('does not let anon select rows directly', async () => {
    const guest = await insertGuest();
    await insertPhoto(guest.id, `${guest.token}/a.jpg`);

    await expect(
      asRole(admin, 'anon', () => admin.query('select * from public.photos')),
    ).rejects.toThrow();
  });

  it('does not let anon insert rows directly', async () => {
    const guest = await insertGuest();

    await expect(
      asRole(admin, 'anon', () =>
        admin.query(
          `insert into public.photos (guest_id, storage_path) values ($1, $2)`,
          [guest.id, `${guest.token}/direct.jpg`],
        ),
      ),
    ).rejects.toThrow();
  });

  it('does not let anon update rows directly', async () => {
    const guest = await insertGuest();
    const photo = await insertPhoto(guest.id, `${guest.token}/a.jpg`);

    await expect(
      asRole(admin, 'anon', () =>
        admin.query(`update public.photos set status = 'approved' where id = $1`, [photo.id]),
      ),
    ).rejects.toThrow();
  });

  it('lets authenticated select, update and delete photos (moderation)', async () => {
    const guest = await insertGuest();
    const photo = await insertPhoto(guest.id, `${guest.token}/a.jpg`);

    const rows = await asRole(admin, 'authenticated', () =>
      admin.query('select * from public.photos where id = $1', [photo.id]),
    );
    expect(rows.rows).toHaveLength(1);

    await asRole(admin, 'authenticated', () =>
      admin.query(`update public.photos set status = 'approved' where id = $1`, [photo.id]),
    );
    const updated = await admin.query('select status from public.photos where id = $1', [photo.id]);
    expect(updated.rows[0].status).toBe('approved');

    await asRole(admin, 'authenticated', () =>
      admin.query('delete from public.photos where id = $1', [photo.id]),
    );
    const afterDelete = await admin.query('select id from public.photos where id = $1', [photo.id]);
    expect(afterDelete.rows).toHaveLength(0);
  });
});

describe('RLS on storage.objects (party-photos)', () => {
  it('lets anon insert an object whose path starts with a real guest token', async () => {
    const guest = await insertGuest();

    await expect(
      asRole(admin, 'anon', () =>
        admin.query(
          `insert into storage.objects (bucket_id, name) values ('party-photos', $1)`,
          [`${guest.token}/photo.jpg`],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('does not let anon insert an object under a made-up token', async () => {
    await expect(
      asRole(admin, 'anon', () =>
        admin.query(
          `insert into storage.objects (bucket_id, name) values ('party-photos', 'not-a-real-token/photo.jpg')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('does not let anon read an object with no approved photo row / before reveal', async () => {
    const guest = await insertGuest();
    const path = `${guest.token}/photo.jpg`;
    await admin.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [path]);
    await insertPhoto(guest.id, path, 'pending');

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from storage.objects where name = $1', [path]),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('lets anon read an object that is approved and the roll has been revealed', async () => {
    const guest = await insertGuest();
    const path = `${guest.token}/photo.jpg`;
    await admin.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [path]);
    await insertPhoto(guest.id, path, 'approved');
    await asRole(admin, 'authenticated', () =>
      admin.query(
        `insert into public.event_config (id, photos_revealed_at) values (true, now())
         on conflict (id) do update set photos_revealed_at = excluded.photos_revealed_at`,
      ),
    );

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from storage.objects where name = $1', [path]),
    );
    expect(result.rows).toHaveLength(1);
  });

  it('does not let anon read an approved object before the roll is revealed', async () => {
    const guest = await insertGuest();
    const path = `${guest.token}/photo.jpg`;
    await admin.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [path]);
    await insertPhoto(guest.id, path, 'approved');
    // event_config.photos_revealed_at left null (default state).

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from storage.objects where name = $1', [path]),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('does not let anon update or delete an object (no matching RLS policy affects 0 rows)', async () => {
    // anon has table-level UPDATE/DELETE grants on storage.objects (same as
    // real Supabase: access there is controlled entirely by RLS policies,
    // not by GRANT/REVOKE). With no UPDATE/DELETE policy at all for anon,
    // Postgres RLS filters out every row for those commands rather than
    // raising an error -- so the correct assertion is "0 rows affected",
    // not a thrown exception.
    const guest = await insertGuest();
    const path = `${guest.token}/photo.jpg`;
    await admin.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [path]);

    const updateResult = await asRole(admin, 'anon', () =>
      admin.query(`update storage.objects set name = 'hacked' where name = $1`, [path]),
    );
    expect(updateResult.rowCount).toBe(0);
    const stillThere = await admin.query('select name from storage.objects where name = $1', [path]);
    expect(stillThere.rows).toHaveLength(1);

    const deleteResult = await asRole(admin, 'anon', () =>
      admin.query('delete from storage.objects where name = $1', [path]),
    );
    expect(deleteResult.rowCount).toBe(0);
    const afterDelete = await admin.query('select name from storage.objects where name = $1', [path]);
    expect(afterDelete.rows).toHaveLength(1);
  });

  it('lets authenticated select/update/delete any party-photos object', async () => {
    const guest = await insertGuest();
    const path = `${guest.token}/photo.jpg`;
    await admin.query(`insert into storage.objects (bucket_id, name) values ('party-photos', $1)`, [path]);

    const rows = await asRole(admin, 'authenticated', () =>
      admin.query('select * from storage.objects where name = $1', [path]),
    );
    expect(rows.rows).toHaveLength(1);

    await asRole(admin, 'authenticated', () =>
      admin.query('delete from storage.objects where name = $1', [path]),
    );
    const afterDelete = await admin.query('select * from storage.objects where name = $1', [path]);
    expect(afterDelete.rows).toHaveLength(0);
  });
});

describe('list_revealed_photos', () => {
  it('returns nothing before the roll is revealed, even if photos are approved', async () => {
    const guest = await insertGuest();
    await insertPhoto(guest.id, `${guest.token}/a.jpg`, 'approved');

    const result = await asRole(admin, 'anon', () => admin.query('select * from list_revealed_photos()'));

    expect(result.rows).toHaveLength(0);
  });

  it('returns only approved photos once the roll is revealed', async () => {
    const guest = await insertGuest();
    await insertPhoto(guest.id, `${guest.token}/a.jpg`, 'approved');
    await insertPhoto(guest.id, `${guest.token}/b.jpg`, 'pending');
    await insertPhoto(guest.id, `${guest.token}/c.jpg`, 'rejected');
    await admin.query('update public.event_config set photos_revealed_at = now() where id = true');

    const result = await asRole(admin, 'anon', () => admin.query('select * from list_revealed_photos()'));

    expect(result.rows.map((r) => r.storage_path)).toEqual([`${guest.token}/a.jpg`]);
  });

  it('never exposes guest_id or status, only storage_path and created_at', async () => {
    const guest = await insertGuest();
    await insertPhoto(guest.id, `${guest.token}/a.jpg`, 'approved');
    await admin.query('update public.event_config set photos_revealed_at = now() where id = true');

    const result = await asRole(admin, 'anon', () => admin.query('select * from list_revealed_photos()'));

    expect(Object.keys(result.rows[0])).toEqual(['storage_path', 'created_at']);
  });

  it('returns the real created_at of each approved photo', async () => {
    const guest = await insertGuest();
    await insertPhoto(guest.id, `${guest.token}/a.jpg`, 'approved');
    await admin.query('update public.event_config set photos_revealed_at = now() where id = true');

    const result = await asRole(admin, 'anon', () => admin.query('select * from list_revealed_photos()'));

    expect(result.rows[0].created_at).not.toBeNull();
    expect(new Date(result.rows[0].created_at).getTime()).not.toBeNaN();
  });
});
