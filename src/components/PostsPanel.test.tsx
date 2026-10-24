import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostsPanel from './PostsPanel';

// El marco real abre un iframe: aquí solo interesa qué estado y qué borrador recibe.
vi.mock('./PhoneFrame', () => ({
  default: ({ src, state, draft, refreshKey }: { src: string; state: string; draft: unknown; refreshKey?: number }) => (
    <div
      data-testid="phone-frame"
      data-src={src}
      data-state={state}
      data-draft={JSON.stringify(draft)}
      data-refresh-key={refreshKey}
    />
  ),
}));

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

describe('PostsPanel: estados de la lista', () => {
  it('si la lectura falla muestra el error con «Reintentar» y NO dice que no hay avisos', async () => {
    vi.mocked(listAllPosts).mockRejectedValueOnce(new Error('No pudimos cargar los avisos.'));
    render(<PostsPanel eventId="ev-1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los avisos.');
    expect(screen.queryByText(/Todavía no hay avisos/)).not.toBeInTheDocument();
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
  });

  it('con la lista caída no ofrece «Nuevo aviso» (no se vería hasta reintentar) y lo devuelve al recargar', async () => {
    vi.mocked(listAllPosts).mockRejectedValueOnce(new Error('sin red')).mockResolvedValueOnce([draftPost]);
    vi.mocked(listPostImages).mockResolvedValue([]);
    render(<PostsPanel eventId="ev-1" />);

    await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.queryByRole('button', { name: 'Nuevo aviso' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Nuevo aviso' })).toBeInTheDocument();
  });

  it('«Reintentar» vuelve a pedir la lista y muestra los avisos', async () => {
    vi.mocked(listAllPosts).mockRejectedValueOnce(new Error('sin red')).mockResolvedValueOnce([draftPost]);
    vi.mocked(listPostImages).mockResolvedValue([]);
    render(<PostsPanel eventId="ev-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Borrador sin publicar')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('volver a leer la lista limpia un error viejo de una acción', async () => {
    vi.mocked(listAllPosts).mockResolvedValue([draftPost]);
    vi.mocked(listPostImages).mockResolvedValue([]);
    vi.mocked(publishPost).mockRejectedValueOnce(new Error('No pudimos cambiar el estado del aviso.'));
    const { rerender } = render(<PostsPanel eventId="ev-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('No pudimos cambiar el estado del aviso.')).toBeInTheDocument();

    rerender(<PostsPanel eventId="ev-2" />);

    await waitFor(() => expect(screen.queryByText('No pudimos cambiar el estado del aviso.')).not.toBeInTheDocument());
  });

  it('mientras reintenta vuelve a decir «Cargando...»', async () => {
    vi.mocked(listAllPosts)
      .mockRejectedValueOnce(new Error('sin red'))
      .mockReturnValueOnce(new Promise(() => undefined));
    render(<PostsPanel eventId="ev-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Cargando...')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

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

  describe('vista previa del aviso (C2)', () => {
    const draftOf = () => JSON.parse(screen.getByTestId('phone-frame').getAttribute('data-draft') ?? 'null');

    it('sin evento (el /admin de la Fase 0) no ofrece la vista previa', async () => {
      vi.mocked(listAllPosts).mockResolvedValueOnce([]);
      const user = userEvent.setup();
      render(<PostsPanel />);
      await waitFor(() => expect(listAllPosts).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: /nuevo aviso/i }));

      expect(screen.queryByRole('button', { name: /ver cómo queda/i })).not.toBeInTheDocument();
    });

    it('al redactar muestra el aviso en la cartelera del teléfono y lo sigue mientras se escribe', async () => {
      vi.mocked(listAllPosts).mockResolvedValueOnce([]);
      const user = userEvent.setup();
      render(<PostsPanel eventId="ev-1" />);
      await waitFor(() => expect(listAllPosts).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: /nuevo aviso/i }));
      expect(screen.queryByTestId('phone-frame')).not.toBeInTheDocument();
      await user.type(screen.getByLabelText(/^título$/i), 'Pizza');
      await user.click(screen.getByRole('button', { name: /ver cómo queda/i }));

      const frame = screen.getByTestId('phone-frame');
      expect(frame).toHaveAttribute('data-src', '/panel/e/ev-1/vista-previa?estado=aviso');
      expect(frame).toHaveAttribute('data-state', 'aviso');
      expect(draftOf()).toEqual({ title: 'Pizza', subtitle: null, body: '', coverImagePath: null, galleryPaths: [] });

      await user.type(screen.getByLabelText(/cuerpo/i), 'A las 22:00');
      expect(draftOf().body).toBe('A las 22:00');

      await user.click(screen.getByRole('button', { name: /ocultar vista previa/i }));
      expect(screen.queryByTestId('phone-frame')).not.toBeInTheDocument();
    });

    it('incluye la portada y la galería ya subidas', async () => {
      vi.mocked(listAllPosts).mockResolvedValueOnce([]);
      vi.mocked(uploadPostImage).mockResolvedValueOnce('ev-1/portada.jpg').mockResolvedValueOnce('ev-1/g1.jpg');
      const user = userEvent.setup();
      render(<PostsPanel eventId="ev-1" />);
      await waitFor(() => expect(listAllPosts).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: /nuevo aviso/i }));
      await user.upload(screen.getByLabelText(/imagen destacada/i), new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
      await user.upload(screen.getByLabelText(/galería/i), new File(['b'], 'b.jpg', { type: 'image/jpeg' }));
      await user.click(screen.getByRole('button', { name: /ver cómo queda/i }));

      expect(draftOf()).toMatchObject({ coverImagePath: 'ev-1/portada.jpg', galleryPaths: ['ev-1/g1.jpg'] });
    });

    it('al editar un aviso existente manda su id, para que no salga repetido', async () => {
      vi.mocked(listAllPosts).mockResolvedValueOnce([draftPost]);
      const user = userEvent.setup();
      render(<PostsPanel eventId="ev-1" />);
      await screen.findByText('Borrador sin publicar');

      await user.click(screen.getByRole('button', { name: /^editar$/i }));
      await user.click(screen.getByRole('button', { name: /ver cómo queda/i }));

      expect(draftOf()).toMatchObject({ id: 'p1', title: 'Borrador sin publicar', body: 'Todavía no está listo' });
    });

    describe('al publicar o despublicar con la vista previa abierta', () => {
      const refreshKeyOf = () => Number(screen.getByTestId('phone-frame').getAttribute('data-refresh-key'));

      async function openPreview(user: ReturnType<typeof userEvent.setup>) {
        await user.click(screen.getByRole('button', { name: /nuevo aviso/i }));
        await user.click(screen.getByRole('button', { name: /ver cómo queda/i }));
      }

      it('publicar le pide al teléfono que vuelva a leer los avisos', async () => {
        vi.mocked(listAllPosts).mockResolvedValueOnce([draftPost]);
        vi.mocked(publishPost).mockResolvedValueOnce({ ...draftPost, publishedAt: '2026-05-05T00:00:00Z' });
        const user = userEvent.setup();
        render(<PostsPanel eventId="ev-1" />);
        await screen.findByText('Borrador sin publicar');
        await openPreview(user);
        const before = refreshKeyOf();

        await user.click(screen.getByRole('button', { name: /^publicar$/i }));

        await waitFor(() => expect(refreshKeyOf()).toBe(before + 1));
      });

      it('despublicar también', async () => {
        vi.mocked(listAllPosts).mockResolvedValueOnce([publishedPost]);
        vi.mocked(unpublishPost).mockResolvedValueOnce({ ...publishedPost, publishedAt: null });
        const user = userEvent.setup();
        render(<PostsPanel eventId="ev-1" />);
        await screen.findByText('Ya salió la lista');
        await openPreview(user);
        const before = refreshKeyOf();

        await user.click(screen.getByRole('button', { name: /despublicar/i }));

        await waitFor(() => expect(refreshKeyOf()).toBe(before + 1));
      });

      it('si publicar falla no se pide ningún refresco', async () => {
        vi.mocked(listAllPosts).mockResolvedValueOnce([draftPost]);
        vi.mocked(publishPost).mockRejectedValueOnce(new Error('sin red'));
        const user = userEvent.setup();
        render(<PostsPanel eventId="ev-1" />);
        await screen.findByText('Borrador sin publicar');
        await openPreview(user);
        const before = refreshKeyOf();

        await user.click(screen.getByRole('button', { name: /^publicar$/i }));

        await waitFor(() => expect(publishPost).toHaveBeenCalled());
        expect(refreshKeyOf()).toBe(before);
      });
    });
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

  describe('en un evento (Fase 1)', () => {
    it('lista solo los avisos de ese evento', async () => {
      vi.mocked(listAllPosts).mockResolvedValueOnce([]);
      render(<PostsPanel eventId="ev-1" />);
      await waitFor(() => expect(listAllPosts).toHaveBeenCalledWith('ev-1'));
    });

    it('crea el aviso en ese evento', async () => {
      vi.mocked(listAllPosts).mockResolvedValueOnce([]);
      vi.mocked(createPost).mockResolvedValueOnce(draftPost);
      const user = userEvent.setup();
      render(<PostsPanel eventId="ev-1" />);
      await waitFor(() => expect(listAllPosts).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: /nuevo aviso/i }));
      await user.type(screen.getByLabelText(/^título$/i), 'Bienvenidos');
      await user.type(screen.getByLabelText(/cuerpo/i), 'Los esperamos');
      await user.click(screen.getByRole('button', { name: /crear/i }));

      await waitFor(() => expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'ev-1' })));
    });
  });

  // Revisión móvil: a 360 px los botones (shrink-0) aplastaban el texto del aviso y se salían del borde.
  describe('en una pantalla angosta', () => {
    async function fila() {
      vi.mocked(listAllPosts).mockResolvedValueOnce([publishedPost]);
      render(<PostsPanel />);
      return (await screen.findByText('Ya salió la lista')).closest('li') as HTMLElement;
    }

    it('apila el contenido y las acciones, y las pone en fila solo desde sm', async () => {
      const li = await fila();
      expect(li.className).toContain('flex-col');
      expect(li.className).toContain('sm:flex-row');
    });

    it('deja que el texto se encoja y se parta en vez de empujar los botones fuera de la pantalla', async () => {
      const li = await fila();
      const contenido = li.firstElementChild as HTMLElement;
      expect(contenido.className).toContain('min-w-0');
      expect(screen.getByText('Ya salió la lista').className).toContain('break-words');
    });

    it('las acciones miden al menos 44 px de alto y su texto 12 px', async () => {
      await fila();
      for (const nombre of [/despublicar/i, /editar/i, /eliminar/i]) {
        const boton = screen.getByRole('button', { name: nombre });
        expect(boton.className).toContain('min-h-11');
        expect(boton.className).not.toMatch(/text-\[(9|10|11)px\]/);
      }
    });
  });
});
