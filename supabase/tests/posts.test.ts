import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyMigrations, asRole, createSupabaseRoles } from './apply-migrations';
import { DATABASE_URL } from './db-config';

let admin: Client;

async function insertPost(overrides: Partial<{
  title: string;
  body: string;
  published_at: string | null;
}> = {}) {
  const title = overrides.title ?? 'Aviso de prueba';
  const body = overrides.body ?? 'Contenido de prueba';
  const published_at = overrides.published_at === undefined ? null : overrides.published_at;

  const result = await admin.query<{ id: string; published_at: string | null }>(
    `insert into public.posts (title, body, published_at)
     values ($1, $2, $3)
     returning id, published_at`,
    [title, body, published_at],
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
  await admin.query('delete from public.posts');
});

describe('RLS on posts', () => {
  it('lets anon read a published post', async () => {
    const post = await insertPost({ title: 'Ya salió la lista', published_at: new Date(Date.now() - 60_000).toISOString() });

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from public.posts where id = $1', [post.id]),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe('Ya salió la lista');
  });

  it('does not let anon read a draft post (published_at is null)', async () => {
    await insertPost({ published_at: null });

    const result = await asRole(admin, 'anon', () => admin.query('select * from public.posts'));
    expect(result.rows).toHaveLength(0);
  });

  it('does not let anon read a post scheduled in the future', async () => {
    await insertPost({ published_at: new Date(Date.now() + 60 * 60_000).toISOString() });

    const result = await asRole(admin, 'anon', () => admin.query('select * from public.posts'));
    expect(result.rows).toHaveLength(0);
  });

  it('does not let anon insert a post', async () => {
    await expect(
      asRole(admin, 'anon', () =>
        admin.query(`insert into public.posts (title, body) values ('x', 'y')`),
      ),
    ).rejects.toThrow();
  });

  it('does not let anon update a post', async () => {
    const post = await insertPost({ published_at: new Date(Date.now() - 60_000).toISOString() });

    await expect(
      asRole(admin, 'anon', () =>
        admin.query('update public.posts set title = $1 where id = $2', ['hacked', post.id]),
      ),
    ).rejects.toThrow();
  });

  it('does not let anon delete a post', async () => {
    const post = await insertPost({ published_at: new Date(Date.now() - 60_000).toISOString() });

    await expect(
      asRole(admin, 'anon', () => admin.query('delete from public.posts where id = $1', [post.id])),
    ).rejects.toThrow();
  });

  it('lets authenticated read, create, update and delete posts including drafts', async () => {
    const draft = await insertPost({ title: 'Borrador', published_at: null });

    const readRows = await asRole(admin, 'authenticated', () =>
      admin.query('select * from public.posts where id = $1', [draft.id]),
    );
    expect(readRows.rows).toHaveLength(1);

    const created = await asRole(admin, 'authenticated', () =>
      admin.query(
        `insert into public.posts (title, body) values ('Nuevo aviso', 'cuerpo') returning id, published_at`,
      ),
    );
    expect(created.rows[0].published_at).toBeNull();

    await asRole(admin, 'authenticated', () =>
      admin.query('update public.posts set title = $1, published_at = now() where id = $2', ['Editado', created.rows[0].id]),
    );
    const updated = await admin.query('select title, published_at from public.posts where id = $1', [created.rows[0].id]);
    expect(updated.rows[0].title).toBe('Editado');
    expect(updated.rows[0].published_at).not.toBeNull();

    await asRole(admin, 'authenticated', () =>
      admin.query('delete from public.posts where id = $1', [created.rows[0].id]),
    );
    const afterDelete = await admin.query('select id from public.posts where id = $1', [created.rows[0].id]);
    expect(afterDelete.rows).toHaveLength(0);
  });
});
