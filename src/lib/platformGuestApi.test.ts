import { beforeEach, describe, expect, it, vi } from 'vitest';

const upload = vi.fn();
const createSignedUrl = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: { rpc: vi.fn(), storage: { from: vi.fn(() => ({ upload, createSignedUrl })) } },
}));

import { supabase } from './supabaseClient';
import {
  getStickerImageUrl,
  listCameraAssets,
  getPublicHeadcount,
  listPublishedPosts,
  listRevealedPhotosForGuest,
  uploadGuestPhoto,
} from './platformGuestApi';

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const identity = { token: 'secret-token', eventId: 'ev-1', guestId: 'g-1' };
const blob = new Blob(['x'], { type: 'image/jpeg' });

const photoRow = {
  id: 'p1',
  guest_id: 'g-1',
  storage_path: 'ev-1/g-1/x.jpg',
  display_storage_path: null,
  status: 'approved',
  created_at: '2026-10-15T00:00:00Z',
};

beforeEach(() => {
  rpc.mockReset();
  upload.mockReset().mockResolvedValue({ error: null });
});

describe('listPublishedPosts', () => {
  it('mapea los avisos con las rutas de su galería', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'a1',
          title: 'Hola',
          subtitle: null,
          body: 'x',
          cover_image_path: 'ev/c.jpg',
          published_at: '2026-10-14T00:00:00Z',
          images: ['ev/1.jpg'],
        },
      ],
      error: null,
    });
    const posts = await listPublishedPosts('fiesta-abcd');
    expect(rpc).toHaveBeenCalledWith('list_published_posts', { p_slug: 'fiesta-abcd' });
    expect(posts[0]).toMatchObject({ id: 'a1', coverImagePath: 'ev/c.jpg', galleryPaths: ['ev/1.jpg'] });
  });

  it('lanza un mensaje legible si falla', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(listPublishedPosts('x')).rejects.toThrow(/No pudimos cargar los avisos/);
  });
});

describe('getPublicHeadcount', () => {
  it('devuelve el número y usa el slug', async () => {
    rpc.mockResolvedValueOnce({ data: 12, error: null });
    expect(await getPublicHeadcount('fiesta-abcd')).toBe(12);
    expect(rpc).toHaveBeenCalledWith('get_public_headcount', { p_slug: 'fiesta-abcd' });
  });
});

describe('listRevealedPhotosForGuest', () => {
  it('pide el rollo con el token del invitado', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ storage_path: 'ev/g/a.jpg', display_storage_path: null, created_at: '2026-10-15T01:00:00Z' }],
      error: null,
    });
    const photos = await listRevealedPhotosForGuest('tok');
    expect(rpc).toHaveBeenCalledWith('list_revealed_photos', { p_token: 'tok' });
    expect(photos).toEqual([
      { storagePath: 'ev/g/a.jpg', displayStoragePath: null, createdAt: '2026-10-15T01:00:00Z' },
    ]);
  });
});

describe('uploadGuestPhoto', () => {
  it('sube a {event_id}/{guest_id}/… y NUNCA pone el token en una ruta', async () => {
    rpc.mockResolvedValueOnce({ data: [photoRow], error: null });
    await uploadGuestPhoto(identity, blob, blob);

    const paths = upload.mock.calls.map((call) => call[0] as string);
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(path).toMatch(/^ev-1\/g-1\/[0-9a-f-]+(-display)?\.jpg$/);
      expect(path).not.toContain('secret-token');
    }

    const args = rpc.mock.calls[0][1];
    expect(args.p_token).toBe('secret-token');
    expect(args.p_storage_path).toBe(paths[0]);
    expect(args.p_display_storage_path).toBe(paths[1]);
  });

  it('sigue sin la copia liviana si esa subida falla', async () => {
    upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'x' } });
    rpc.mockResolvedValueOnce({ data: [photoRow], error: null });
    await uploadGuestPhoto(identity, blob, blob);
    expect(rpc.mock.calls[0][1].p_display_storage_path).toBeNull();
  });

  describe('reintento del mismo archivo', () => {
    const pathsOf = () => upload.mock.calls.map((call) => call[0] as string);

    it('reusa la misma ruta (y la misma copia liviana) al reintentar el mismo blob', async () => {
      const photo = new Blob(['una foto'], { type: 'image/jpeg' });
      rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000' } });
      await expect(uploadGuestPhoto(identity, photo, photo)).rejects.toThrow(/no pudimos registrarla/);

      rpc.mockResolvedValueOnce({ data: [photoRow], error: null });
      await uploadGuestPhoto(identity, photo, photo);

      const [first, firstDisplay, second, secondDisplay] = pathsOf();
      expect(second).toBe(first);
      expect(secondDisplay).toBe(firstDisplay);
      expect(rpc.mock.calls[1][1].p_storage_path).toBe(rpc.mock.calls[0][1].p_storage_path);
    });

    it('otra foto usa otra ruta', async () => {
      rpc.mockResolvedValue({ data: [photoRow], error: null });
      await uploadGuestPhoto(identity, new Blob(['a'], { type: 'image/jpeg' }));
      await uploadGuestPhoto(identity, new Blob(['b'], { type: 'image/jpeg' }));
      const [first, second] = pathsOf();
      expect(second).not.toBe(first);
    });

    it('si el archivo ya estaba en Storage (reintento tras una subida que sí llegó) sigue y registra', async () => {
      const photo = new Blob(['una foto'], { type: 'image/jpeg' });
      upload.mockResolvedValueOnce({ error: { message: 'The resource already exists', statusCode: '409' } });
      rpc.mockResolvedValueOnce({ data: [photoRow], error: null });

      await expect(uploadGuestPhoto(identity, photo)).resolves.toBeDefined();
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('si la copia liviana ya estaba, la registra igual', async () => {
      const photo = new Blob(['una foto'], { type: 'image/jpeg' });
      upload
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: { message: 'The resource already exists', statusCode: '409' } });
      rpc.mockResolvedValueOnce({ data: [photoRow], error: null });

      await uploadGuestPhoto(identity, photo, photo);
      expect(rpc.mock.calls[0][1].p_display_storage_path).toMatch(/-display\.jpg$/);
    });

    it('otro error de Storage sigue siendo un fallo', async () => {
      upload.mockResolvedValueOnce({ error: { message: 'Payload too large', statusCode: '413' } });
      await expect(uploadGuestPhoto(identity, new Blob(['z']))).rejects.toThrow(/No pudimos subir la foto/);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  it('falla si la subida del original falla, sin registrar nada', async () => {
    upload.mockResolvedValueOnce({ error: { message: 'x' } });
    await expect(uploadGuestPhoto(identity, blob)).rejects.toThrow(/No pudimos subir la foto/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['22023', /todos los disparos/],
    ['42501', /todavía no está habilitada/],
    ['XX000', /no pudimos registrarla/],
  ])('traduce el código %s al registrar', async (code, message) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code } });
    await expect(uploadGuestPhoto(identity, blob)).rejects.toThrow(message);
  });
});

describe('listCameraAssets', () => {
  it('separa marcos y stickers, limpia los parámetros y marca el marco por defecto', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { asset_type: 'frame', id: 'f1', label: 'Borde', template: 'border', params: { primaryColor: '#112233', hack: 1 }, emoji: null, storage_path: null, is_default: true },
        { asset_type: 'sticker', id: 's1', label: null, template: null, params: null, emoji: '🎉', storage_path: null, is_default: false },
        { asset_type: 'sticker', id: 's2', label: null, template: null, params: null, emoji: null, storage_path: 'ev/stickers/a.webp', is_default: false },
      ],
      error: null,
    });

    const assets = await listCameraAssets('tok');

    expect(rpc).toHaveBeenCalledWith('list_event_camera_assets', { p_token: 'tok' });
    expect(assets.frames).toEqual([
      { id: 'f1', label: 'Borde', template: 'border', params: { primaryColor: '#112233' }, isDefault: true },
    ]);
    expect(assets.stickers).toEqual([
      { id: 's1', kind: 'emoji', emoji: '🎉', storagePath: null },
      { id: 's2', kind: 'image', emoji: null, storagePath: 'ev/stickers/a.webp' },
    ]);
  });

  it('devuelve listas vacías cuando el evento no tiene nada activo', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await listCameraAssets('tok')).toEqual({ frames: [], stickers: [] });
  });

  it('lanza un mensaje legible si falla', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(listCameraAssets('tok')).rejects.toThrow(/marcos y stickers/);
  });
});

describe('getStickerImageUrl', () => {
  it('firma la ruta en el bucket event-assets', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://x/s' }, error: null });
    expect(await getStickerImageUrl('ev/stickers/a.webp')).toBe('https://x/s');
    expect(createSignedUrl).toHaveBeenCalledWith('ev/stickers/a.webp', 3600);
  });

  it('falla con un mensaje legible', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await expect(getStickerImageUrl('p')).rejects.toThrow(/sticker/);
  });
});
