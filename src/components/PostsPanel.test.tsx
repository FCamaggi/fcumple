import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostsPanel from './PostsPanel';

vi.mock('../lib/postsApi', () => ({
  listAllPosts: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn(),
}));

import {
  listAllPosts,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
} from '../lib/postsApi';

const draftPost = {
  id: 'p1',
  title: 'Borrador sin publicar',
  body: 'Todavía no está listo',
  publishedAt: null,
  createdAt: '2026-04-28T00:00:00Z',
};

const publishedPost = {
  id: 'p2',
  title: 'Ya salió la lista',
  body: 'Revisen el link',
  publishedAt: '2026-05-01T00:00:00Z',
  createdAt: '2026-04-27T00:00:00Z',
};

beforeEach(() => {
  vi.mocked(listAllPosts).mockReset();
  vi.mocked(createPost).mockReset();
  vi.mocked(updatePost).mockReset();
  vi.mocked(deletePost).mockReset();
  vi.mocked(publishPost).mockReset();
  vi.mocked(unpublishPost).mockReset();
});

describe('PostsPanel', () => {
  it('lists all posts including drafts', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([draftPost, publishedPost]);

    render(<PostsPanel />);

    expect(await screen.findByText('Borrador sin publicar')).toBeInTheDocument();
    expect(screen.getByText('Ya salió la lista')).toBeInTheDocument();
  });

  it('creates a new post as a draft', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([]);
    vi.mocked(createPost).mockResolvedValueOnce(draftPost);
    const user = userEvent.setup();

    render(<PostsPanel />);
    await waitFor(() => expect(listAllPosts).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /nuevo aviso/i }));
    await user.type(screen.getByLabelText(/título/i), 'Borrador sin publicar');
    await user.type(screen.getByLabelText(/cuerpo/i), 'Todavía no está listo');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() =>
      expect(createPost).toHaveBeenCalledWith({ title: 'Borrador sin publicar', body: 'Todavía no está listo' }),
    );
    expect(await screen.findByText('Borrador sin publicar')).toBeInTheDocument();
  });

  it('publishes a draft', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([draftPost]);
    vi.mocked(publishPost).mockResolvedValueOnce({ ...draftPost, publishedAt: '2026-05-05T00:00:00Z' });
    const user = userEvent.setup();

    render(<PostsPanel />);
    await screen.findByText('Borrador sin publicar');

    await user.click(screen.getByRole('button', { name: /publicar/i }));

    await waitFor(() => expect(publishPost).toHaveBeenCalledWith('p1'));
    expect(await screen.findByRole('button', { name: /despublicar/i })).toBeInTheDocument();
  });

  it('unpublishes a published post', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([publishedPost]);
    vi.mocked(unpublishPost).mockResolvedValueOnce({ ...publishedPost, publishedAt: null });
    const user = userEvent.setup();

    render(<PostsPanel />);
    await screen.findByText('Ya salió la lista');

    await user.click(screen.getByRole('button', { name: /despublicar/i }));

    await waitFor(() => expect(unpublishPost).toHaveBeenCalledWith('p2'));
    expect(await screen.findByRole('button', { name: /^publicar$/i })).toBeInTheDocument();
  });

  it('edits a post title and body', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([draftPost]);
    vi.mocked(updatePost).mockResolvedValueOnce({ ...draftPost, title: 'Editado' });
    const user = userEvent.setup();

    render(<PostsPanel />);
    await screen.findByText('Borrador sin publicar');

    await user.click(screen.getByRole('button', { name: /editar/i }));
    const titleInput = screen.getByLabelText(/título/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Editado');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(updatePost).toHaveBeenCalledWith('p1', { title: 'Editado', body: 'Todavía no está listo' }),
    );
    expect(await screen.findByText('Editado')).toBeInTheDocument();
  });

  it('deletes a post', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([draftPost]);
    vi.mocked(deletePost).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<PostsPanel />);
    await screen.findByText('Borrador sin publicar');

    await user.click(screen.getByRole('button', { name: /eliminar/i }));

    await waitFor(() => expect(deletePost).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.queryByText('Borrador sin publicar')).not.toBeInTheDocument());
  });

  it('shows an empty state when there are no posts yet', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([]);

    render(<PostsPanel />);

    expect(await screen.findByText(/todavía no hay avisos/i)).toBeInTheDocument();
  });
});
