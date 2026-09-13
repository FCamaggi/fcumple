import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

import { supabase } from './supabaseClient';
import {
  listPublishedPosts,
  listAllPosts,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
  uploadPostImage,
  listPostImages,
  addPostImage,
  deletePostImage,
  getPostImageUrl,
} from './postsApi';

const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
const storageFrom = supabase.storage.from as unknown as ReturnType<typeof vi.fn>;

const row = {
  id: 'p1',
  title: 'Ya salió la lista de invitados',
  subtitle: null,
  body: 'Revisen el link, quedan pocos cupos.',
  cover_image_path: null,
  published_at: '2026-05-01T00:00:00Z',
  created_at: '2026-04-28T00:00:00Z',
};

beforeEach(() => {
  from.mockReset();
  storageFrom.mockReset();
});

describe('listPublishedPosts', () => {
  it('queries only published posts ordered by most recent first', async () => {
    const order = vi.fn().mockResolvedValue({ data: [row], error: null });
    const lte = vi.fn().mockReturnValue({ order });
    const not = vi.fn().mockReturnValue({ lte });
    const select = vi.fn().mockReturnValue({ not });
    from.mockReturnValue({ select });

    const posts = await listPublishedPosts();

    expect(from).toHaveBeenCalledWith('posts');
    expect(not).toHaveBeenCalledWith('published_at', 'is', null);
    expect(lte).toHaveBeenCalledWith('published_at', expect.any(String));
    expect(order).toHaveBeenCalledWith('published_at', { ascending: false });
    expect(posts).toEqual([
      {
        id: 'p1',
        title: 'Ya salió la lista de invitados',
        subtitle: null,
        body: 'Revisen el link, quedan pocos cupos.',
        coverImagePath: null,
        publishedAt: '2026-05-01T00:00:00Z',
        createdAt: '2026-04-28T00:00:00Z',
      },
    ]);
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'network down' } });
    const lte = vi.fn().mockReturnValue({ order });
    const not = vi.fn().mockReturnValue({ lte });
    const select = vi.fn().mockReturnValue({ not });
    from.mockReturnValue({ select });

    await expect(listPublishedPosts()).rejects.toThrow(/network down/);
  });
});

describe('listAllPosts', () => {
  it('queries all posts ordered by most recent first', async () => {
    const order = vi.fn().mockResolvedValue({ data: [row], error: null });
    const select = vi.fn().mockReturnValue({ order });
    from.mockReturnValue({ select });

    const posts = await listAllPosts();

    expect(from).toHaveBeenCalledWith('posts');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('p1');
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const select = vi.fn().mockReturnValue({ order });
    from.mockReturnValue({ select });

    await expect(listAllPosts()).rejects.toThrow(/permission denied/);
  });
});

describe('createPost', () => {
  it('creates a post as a draft (published_at null)', async () => {
    const draftRow = { ...row, published_at: null };
    const single = vi.fn().mockResolvedValue({ data: draftRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ insert });

    const post = await createPost({ title: 'Nuevo aviso', body: 'cuerpo' });

    expect(from).toHaveBeenCalledWith('posts');
    expect(insert).toHaveBeenCalledWith({
      title: 'Nuevo aviso',
      body: 'cuerpo',
      subtitle: null,
      cover_image_path: null,
      published_at: null,
    });
    expect(post.publishedAt).toBeNull();
  });

  it('accepts an optional subtitle and coverImagePath', async () => {
    const draftRow = { ...row, subtitle: 'Subtítulo', cover_image_path: 'p1/cover.jpg', published_at: null };
    const single = vi.fn().mockResolvedValue({ data: draftRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ insert });

    const post = await createPost({
      title: 'Nuevo aviso',
      body: 'cuerpo',
      subtitle: 'Subtítulo',
      coverImagePath: 'p1/cover.jpg',
    });

    expect(insert).toHaveBeenCalledWith({
      title: 'Nuevo aviso',
      body: 'cuerpo',
      subtitle: 'Subtítulo',
      cover_image_path: 'p1/cover.jpg',
      published_at: null,
    });
    expect(post.subtitle).toBe('Subtítulo');
    expect(post.coverImagePath).toBe('p1/cover.jpg');
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ insert });

    await expect(createPost({ title: 'x', body: 'y' })).rejects.toThrow(/permission denied/);
  });
});

describe('updatePost', () => {
  it('updates only the given fields, mapped to snake_case', async () => {
    const updatedRow = { ...row, title: 'Editado' };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    const post = await updatePost('p1', { title: 'Editado' });

    expect(from).toHaveBeenCalledWith('posts');
    expect(update).toHaveBeenCalledWith({ title: 'Editado' });
    expect(eq).toHaveBeenCalledWith('id', 'p1');
    expect(post.title).toBe('Editado');
  });

  it('maps subtitle and coverImagePath to snake_case', async () => {
    const updatedRow = { ...row, subtitle: 'Nuevo subtítulo', cover_image_path: 'p1/new.jpg' };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    await updatePost('p1', { subtitle: 'Nuevo subtítulo', coverImagePath: 'p1/new.jpg' });

    expect(update).toHaveBeenCalledWith({ subtitle: 'Nuevo subtítulo', cover_image_path: 'p1/new.jpg' });
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    await expect(updatePost('p1', { title: 'x' })).rejects.toThrow(/permission denied/);
  });
});

describe('deletePost', () => {
  it('deletes the post by id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ delete: del });

    await deletePost('p1');

    expect(from).toHaveBeenCalledWith('posts');
    expect(eq).toHaveBeenCalledWith('id', 'p1');
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'permission denied' } });
    const del = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ delete: del });

    await expect(deletePost('p1')).rejects.toThrow(/permission denied/);
  });
});

describe('publishPost / unpublishPost', () => {
  it('publishPost sets published_at to an ISO timestamp', async () => {
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    await publishPost('p1');

    expect(update).toHaveBeenCalledWith({ published_at: expect.any(String) });
    expect(new Date(update.mock.calls[0][0].published_at).toString()).not.toBe('Invalid Date');
  });

  it('unpublishPost sets published_at to null', async () => {
    const draftRow = { ...row, published_at: null };
    const single = vi.fn().mockResolvedValue({ data: draftRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    const post = await unpublishPost('p1');

    expect(update).toHaveBeenCalledWith({ published_at: null });
    expect(post.publishedAt).toBeNull();
  });
});

describe('uploadPostImage', () => {
  it('uploads to the post-images bucket under a path scoped to the post id and returns the storage path', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    storageFrom.mockReturnValue({ upload });
    const file = new File(['bytes'], 'flyer.jpg', { type: 'image/jpeg' });

    const path = await uploadPostImage(file, 'p1');

    expect(storageFrom).toHaveBeenCalledWith('post-images');
    expect(upload).toHaveBeenCalledTimes(1);
    const [calledPath, calledFile] = upload.mock.calls[0];
    expect(calledPath).toMatch(/^p1\/.+-flyer\.jpg$/);
    expect(calledFile).toBe(file);
    expect(path).toBe(calledPath);
  });

  it('throws a readable error when the upload fails', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'bucket denied' } });
    storageFrom.mockReturnValue({ upload });
    const file = new File(['bytes'], 'flyer.jpg', { type: 'image/jpeg' });

    await expect(uploadPostImage(file, 'p1')).rejects.toThrow(/bucket denied/);
  });
});

describe('listPostImages', () => {
  it('lists images for a post ordered by position', async () => {
    const imageRow = { id: 'img1', post_id: 'p1', storage_path: 'p1/a.jpg', position: 0 };
    const order = vi.fn().mockResolvedValue({ data: [imageRow], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    const images = await listPostImages('p1');

    expect(from).toHaveBeenCalledWith('post_images');
    expect(eq).toHaveBeenCalledWith('post_id', 'p1');
    expect(order).toHaveBeenCalledWith('position', { ascending: true });
    expect(images).toEqual([{ id: 'img1', postId: 'p1', storagePath: 'p1/a.jpg', position: 0 }]);
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    await expect(listPostImages('p1')).rejects.toThrow(/denied/);
  });
});

describe('addPostImage', () => {
  it('inserts a post_images row at the given position', async () => {
    const insertedRow = { id: 'img2', post_id: 'p1', storage_path: 'p1/b.jpg', position: 1 };
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ insert });

    const image = await addPostImage({ postId: 'p1', storagePath: 'p1/b.jpg', position: 1 });

    expect(from).toHaveBeenCalledWith('post_images');
    expect(insert).toHaveBeenCalledWith({ post_id: 'p1', storage_path: 'p1/b.jpg', position: 1 });
    expect(image).toEqual({ id: 'img2', postId: 'p1', storagePath: 'p1/b.jpg', position: 1 });
  });
});

describe('deletePostImage', () => {
  it('deletes a post_images row by id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ delete: del });

    await deletePostImage('img1');

    expect(from).toHaveBeenCalledWith('post_images');
    expect(eq).toHaveBeenCalledWith('id', 'img1');
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'denied' } });
    const del = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ delete: del });

    await expect(deletePostImage('img1')).rejects.toThrow(/denied/);
  });
});

describe('getPostImageUrl', () => {
  // El bucket post-images es privado (ver supabase/migrations/
  // 20260913100001_storage_post_images.sql) -- getPublicUrl() resuelve la
  // URL sin mirar RLS para nada, así que sirve el archivo solo si el
  // bucket tiene public=true en storage.buckets. Con un bucket privado esa
  // URL siempre da 404/400, publicado o no. createSignedUrl() es el mismo
  // patrón que ya usa getSignedPhotoUrl() en photosApi.ts para party-photos
  // (también privado) -- por eso esta función es async.
  it('resolves a signed url for a storage path in the post-images bucket', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://cdn.example/signed/p1/a.jpg' }, error: null });
    storageFrom.mockReturnValue({ createSignedUrl });

    const url = await getPostImageUrl('p1/a.jpg');

    expect(storageFrom).toHaveBeenCalledWith('post-images');
    expect(createSignedUrl).toHaveBeenCalledWith('p1/a.jpg', expect.any(Number));
    expect(url).toBe('https://cdn.example/signed/p1/a.jpg');
  });

  it('throws a readable error when the signed url request fails', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    storageFrom.mockReturnValue({ createSignedUrl });

    await expect(getPostImageUrl('p1/a.jpg')).rejects.toThrow(/not found|imagen/i);
  });
});
