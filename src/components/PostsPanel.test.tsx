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
  uploadPostImage: vi.fn(),
  listPostImages: vi.fn(),
  addPostImage: vi.fn(),
  // getPostImageUrl es async de verdad (createSignedUrl contra un bucket
  // privado) -- el mock lo refleja para no dejar pasar una regresión donde
  // el componente vuelva a tratarlo como síncrono.
  getPostImageUrl: vi.fn((path: string) => Promise.resolve(`https://cdn.example/${path}`)),
}));

import {
  listAllPosts,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
  uploadPostImage,
  listPostImages,
  addPostImage,
} from '../lib/postsApi';

const draftPost = {
  id: 'p1',
  title: 'Borrador sin publicar',
  subtitle: null,
  body: 'Todavía no está listo',
  coverImagePath: null,
  publishedAt: null,
  createdAt: '2026-04-28T00:00:00Z',
};

const publishedPost = {
  id: 'p2',
  title: 'Ya salió la lista',
  subtitle: 'Quedan pocos cupos',
  body: 'Revisen el link',
  coverImagePath: 'p2/cover.jpg',
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
  vi.mocked(uploadPostImage).mockReset();
  vi.mocked(listPostImages).mockReset();
  vi.mocked(listPostImages).mockResolvedValue([]);
  vi.mocked(addPostImage).mockReset();
});

describe('PostsPanel', () => {
  it('lists all posts including drafts', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([draftPost, publishedPost]);

    render(<PostsPanel />);

    expect(await screen.findByText('Borrador sin publicar')).toBeInTheDocument();
    expect(screen.getByText('Ya salió la lista')).toBeInTheDocument();
  });

  it('shows the subtitle and cover thumbnail of an existing post', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([publishedPost]);

    render(<PostsPanel />);

    expect(await screen.findByText('Quedan pocos cupos')).toBeInTheDocument();
    expect(await screen.findByAltText(/portada/i)).toHaveAttribute('src', 'https://cdn.example/p2/cover.jpg');
  });

  it('creates a new post as a draft, including an optional subtitle', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([]);
    vi.mocked(createPost).mockResolvedValueOnce(draftPost);
    const user = userEvent.setup();

    render(<PostsPanel />);
    await waitFor(() => expect(listAllPosts).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /nuevo aviso/i }));
    await user.type(screen.getByLabelText(/^título$/i), 'Borrador sin publicar');
    await user.type(screen.getByLabelText(/cuerpo/i), 'Todavía no está listo');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() =>
      expect(createPost).toHaveBeenCalledWith({
        title: 'Borrador sin publicar',
        body: 'Todavía no está listo',
        subtitle: null,
        coverImagePath: null,
      }),
    );
    expect(await screen.findByText('Borrador sin publicar')).toBeInTheDocument();
  });

  it('uploads a cover image when creating a post and saves its storage path', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([]);
    vi.mocked(uploadPostImage).mockResolvedValueOnce('p1/cover.jpg');
    vi.mocked(createPost).mockResolvedValueOnce({ ...draftPost, coverImagePath: 'p1/cover.jpg' });
    const user = userEvent.setup();

    render(<PostsPanel />);
    await waitFor(() => expect(listAllPosts).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /nuevo aviso/i }));
    await user.type(screen.getByLabelText(/^título$/i), 'Con portada');
    await user.type(screen.getByLabelText(/cuerpo/i), 'cuerpo');

    const file = new File(['bytes'], 'flyer.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(/imagen destacada/i), file);

    await user.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() => expect(uploadPostImage).toHaveBeenCalledWith(file, expect.any(String)));
    await waitFor(() =>
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Con portada', coverImagePath: 'p1/cover.jpg' }),
      ),
    );
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
    const titleInput = screen.getByLabelText(/^título$/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Editado');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(updatePost).toHaveBeenCalledWith('p1', {
        title: 'Editado',
        body: 'Todavía no está listo',
        subtitle: null,
        coverImagePath: null,
      }),
    );
    expect(await screen.findByText('Editado')).toBeInTheDocument();
  });

  it('uploads gallery images when creating a post and registers each one', async () => {
    vi.mocked(listAllPosts).mockResolvedValueOnce([]);
    vi.mocked(createPost).mockResolvedValueOnce(draftPost);
    vi.mocked(uploadPostImage).mockResolvedValueOnce('p1/gal-a.jpg').mockResolvedValueOnce('p1/gal-b.jpg');
    vi.mocked(addPostImage)
      .mockResolvedValueOnce({ id: 'img1', postId: 'p1', storagePath: 'p1/gal-a.jpg', position: 0 })
      .mockResolvedValueOnce({ id: 'img2', postId: 'p1', storagePath: 'p1/gal-b.jpg', position: 1 });
    const user = userEvent.setup();

    render(<PostsPanel />);
    await waitFor(() => expect(listAllPosts).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /nuevo aviso/i }));
    await user.type(screen.getByLabelText(/^título$/i), 'Con galería');
    await user.type(screen.getByLabelText(/cuerpo/i), 'cuerpo');

    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(/galería/i), [fileA, fileB]);

    await user.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() => expect(addPostImage).toHaveBeenCalledTimes(2));
    expect(addPostImage).toHaveBeenCalledWith({ postId: 'p1', storagePath: 'p1/gal-a.jpg', position: 0 });
    expect(addPostImage).toHaveBeenCalledWith({ postId: 'p1', storagePath: 'p1/gal-b.jpg', position: 1 });
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
