import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: { from: vi.fn() },
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
} from './postsApi';

const from = supabase.from as unknown as ReturnType<typeof vi.fn>;

const row = {
  id: 'p1',
  title: 'Ya salió la lista de invitados',
  body: 'Revisen el link, quedan pocos cupos.',
  published_at: '2026-05-01T00:00:00Z',
  created_at: '2026-04-28T00:00:00Z',
};

beforeEach(() => {
  from.mockReset();
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
        body: 'Revisen el link, quedan pocos cupos.',
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
    expect(insert).toHaveBeenCalledWith({ title: 'Nuevo aviso', body: 'cuerpo', published_at: null });
    expect(post.publishedAt).toBeNull();
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
