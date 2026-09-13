import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyMigrations, asRole, createStorageSchema, createSupabaseRoles } from './apply-migrations';
import { DATABASE_URL } from './db-config';

let admin: Client;

async function insertPost(overrides: Partial<{
  title: string;
  body: string;
  subtitle: string | null;
  cover_image_path: string | null;
  published_at: string | null;
}> = {}) {
  const title = overrides.title ?? 'Aviso de prueba';
  const body = overrides.body ?? 'Contenido de prueba';
  const subtitle = overrides.subtitle ?? null;
  const cover_image_path = overrides.cover_image_path ?? null;
  const published_at = overrides.published_at === undefined ? null : overrides.published_at;

  const result = await admin.query<{ id: string; published_at: string | null }>(
    `insert into public.posts (title, body, subtitle, cover_image_path, published_at)
     values ($1, $2, $3, $4, $5)
     returning id, published_at`,
    [title, body, subtitle, cover_image_path, published_at],
  );
  return result.rows[0];
}

async function insertPostImage(postId: string, storagePath: string, position = 0) {
  const result = await admin.query<{ id: string }>(
    `insert into public.post_images (post_id, storage_path, position)
     values ($1, $2, $3)
     returning id`,
    [postId, storagePath, position],
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
  await admin.query(`delete from storage.objects where bucket_id = 'post-images'`);
  await admin.query('delete from public.post_images');
  await admin.query('delete from public.posts');
});

describe('posts.subtitle / posts.cover_image_path', () => {
  it('lets anon read subtitle and cover_image_path of a published post', async () => {
    const post = await insertPost({
      subtitle: 'Subtítulo de prueba',
      cover_image_path: 'covers/a.jpg',
      published_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const result = await asRole(admin, 'anon', () =>
      admin.query('select subtitle, cover_image_path from public.posts where id = $1', [post.id]),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].subtitle).toBe('Subtítulo de prueba');
    expect(result.rows[0].cover_image_path).toBe('covers/a.jpg');
  });

  it('does not let anon read a draft post at all (subtitle/cover included)', async () => {
    await insertPost({ subtitle: 'oculto', cover_image_path: 'covers/hidden.jpg', published_at: null });

    const result = await asRole(admin, 'anon', () => admin.query('select * from public.posts'));
    expect(result.rows).toHaveLength(0);
  });
});

describe('RLS on post_images', () => {
  it('lets anon read images of a published post', async () => {
    const post = await insertPost({ published_at: new Date(Date.now() - 60_000).toISOString() });
    await insertPostImage(post.id, `${post.id}/1.jpg`, 0);
    await insertPostImage(post.id, `${post.id}/2.jpg`, 1);

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from public.post_images where post_id = $1 order by position', [post.id]),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.storage_path)).toEqual([`${post.id}/1.jpg`, `${post.id}/2.jpg`]);
  });

  it('does not let anon read images of a draft post', async () => {
    const post = await insertPost({ published_at: null });
    await insertPostImage(post.id, `${post.id}/1.jpg`);

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from public.post_images where post_id = $1', [post.id]),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('does not let anon read images of a post scheduled in the future', async () => {
    const post = await insertPost({ published_at: new Date(Date.now() + 60 * 60_000).toISOString() });
    await insertPostImage(post.id, `${post.id}/1.jpg`);

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from public.post_images where post_id = $1', [post.id]),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('does not let anon insert, update or delete post_images', async () => {
    const post = await insertPost({ published_at: new Date(Date.now() - 60_000).toISOString() });
    const image = await insertPostImage(post.id, `${post.id}/1.jpg`);

    await expect(
      asRole(admin, 'anon', () =>
        admin.query(
          `insert into public.post_images (post_id, storage_path) values ($1, $2)`,
          [post.id, `${post.id}/sneaky.jpg`],
        ),
      ),
    ).rejects.toThrow();

    await expect(
      asRole(admin, 'anon', () =>
        admin.query('update public.post_images set position = 5 where id = $1', [image.id]),
      ),
    ).rejects.toThrow();

    await expect(
      asRole(admin, 'anon', () => admin.query('delete from public.post_images where id = $1', [image.id])),
    ).rejects.toThrow();
  });

  it('lets authenticated insert, update and delete post_images regardless of publish state', async () => {
    const draft = await insertPost({ published_at: null });

    const created = await asRole(admin, 'authenticated', () =>
      admin.query(
        `insert into public.post_images (post_id, storage_path, position) values ($1, $2, 0) returning id`,
        [draft.id, `${draft.id}/1.jpg`],
      ),
    );
    const imageId = created.rows[0].id;

    await asRole(admin, 'authenticated', () =>
      admin.query('update public.post_images set position = 3 where id = $1', [imageId]),
    );
    const updated = await admin.query('select position from public.post_images where id = $1', [imageId]);
    expect(updated.rows[0].position).toBe(3);

    await asRole(admin, 'authenticated', () =>
      admin.query('delete from public.post_images where id = $1', [imageId]),
    );
    const afterDelete = await admin.query('select id from public.post_images where id = $1', [imageId]);
    expect(afterDelete.rows).toHaveLength(0);
  });

  it('deletes a post\'s images when the post itself is deleted (on delete cascade)', async () => {
    const post = await insertPost({ published_at: new Date(Date.now() - 60_000).toISOString() });
    await insertPostImage(post.id, `${post.id}/1.jpg`);

    await admin.query('delete from public.posts where id = $1', [post.id]);

    const remaining = await admin.query('select id from public.post_images where post_id = $1', [post.id]);
    expect(remaining.rows).toHaveLength(0);
  });
});

describe('RLS on storage.objects (post-images)', () => {
  it('does not let anon insert an object into post-images', async () => {
    await expect(
      asRole(admin, 'anon', () =>
        admin.query(`insert into storage.objects (bucket_id, name) values ('post-images', 'x/1.jpg')`),
      ),
    ).rejects.toThrow();
  });

  it('does not let anon read an object that matches no post_images row and no cover_image_path', async () => {
    await admin.query(`insert into storage.objects (bucket_id, name) values ('post-images', 'orphan/1.jpg')`);

    const result = await asRole(admin, 'anon', () =>
      admin.query(`select * from storage.objects where name = 'orphan/1.jpg'`),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('lets anon read a gallery object once its post is published', async () => {
    const post = await insertPost({ published_at: new Date(Date.now() - 60_000).toISOString() });
    const path = `${post.id}/1.jpg`;
    await insertPostImage(post.id, path);
    await admin.query(`insert into storage.objects (bucket_id, name) values ('post-images', $1)`, [path]);

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from storage.objects where name = $1', [path]),
    );
    expect(result.rows).toHaveLength(1);
  });

  it('does not let anon read a gallery object while its post is still a draft', async () => {
    const post = await insertPost({ published_at: null });
    const path = `${post.id}/1.jpg`;
    await insertPostImage(post.id, path);
    await admin.query(`insert into storage.objects (bucket_id, name) values ('post-images', $1)`, [path]);

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from storage.objects where name = $1', [path]),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('lets anon read a cover image object once its post is published', async () => {
    const path = 'covers/a.jpg';
    const post = await insertPost({
      cover_image_path: path,
      published_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await admin.query(`insert into storage.objects (bucket_id, name) values ('post-images', $1)`, [path]);

    const result = await asRole(admin, 'anon', () =>
      admin.query('select * from storage.objects where name = $1', [path]),
    );
    expect(result.rows).toHaveLength(1);
    void post;
  });

  it('lets authenticated select/update/delete any post-images object', async () => {
    const post = await insertPost({ published_at: null });
    const path = `${post.id}/1.jpg`;
    await admin.query(`insert into storage.objects (bucket_id, name) values ('post-images', $1)`, [path]);

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
