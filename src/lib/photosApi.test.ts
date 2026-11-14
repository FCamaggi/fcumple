import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.stubGlobal('crypto', { randomUUID: () => 'fixed-uuid' });

import { supabase } from './supabaseClient';
import {
  getPhotoQuota,
  uploadPhoto,
  listAllPhotosForModeration,
  moderatePhoto,
  getSignedPhotoUrl,
  getSignedPhotoDownloadUrl,
  resolvePhotoDownload,
  listRevealedPhotos,
} from './photosApi';
import { SAMPLE_PHOTOS } from './samplePhotos';

const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const storageFrom = supabase.storage.from as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
  storageFrom.mockReset();
});

describe('getPhotoQuota', () => {
  it('maps the quota/used row for a valid token', async () => {
    rpc.mockResolvedValue({ data: [{ quota: 5, used: 2 }], error: null });

    const quota = await getPhotoQuota('tok123');

    expect(rpc).toHaveBeenCalledWith('get_photo_quota', { p_token: 'tok123' });
    expect(quota).toEqual({ quota: 5, used: 2 });
  });

  it('throws a readable error for a token with no matching guest', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(getPhotoQuota('bad-token')).rejects.toThrow(/no es válid/i);
  });

  it('throws a readable error when supabase reports a failure', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });

    await expect(getPhotoQuota('tok123')).rejects.toThrow(/network down/);
  });
});

describe('uploadPhoto', () => {
  const blob = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });
  const displayBlob = new Blob(['fake-jpeg-display-bytes'], { type: 'image/jpeg' });

  it('uploads both the original and display blobs and registers both paths via submit_photo', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'tok123/fixed-uuid.jpg' }, error: null });
    storageFrom.mockReturnValue({ upload });
    rpc.mockResolvedValue({
      data: [
        {
          id: 'photo-1',
          guest_id: 'g1',
          storage_path: 'tok123/fixed-uuid.jpg',
          display_storage_path: 'tok123/fixed-uuid-display.jpg',
          status: 'pending',
          created_at: '2026-06-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const photo = await uploadPhoto('tok123', blob, displayBlob);

    expect(storageFrom).toHaveBeenCalledWith('party-photos');
    expect(upload).toHaveBeenCalledWith('tok123/fixed-uuid.jpg', blob, { contentType: 'image/jpeg' });
    expect(upload).toHaveBeenCalledWith('tok123/fixed-uuid-display.jpg', displayBlob, { contentType: 'image/jpeg' });
    expect(rpc).toHaveBeenCalledWith('submit_photo', {
      p_token: 'tok123',
      p_storage_path: 'tok123/fixed-uuid.jpg',
      p_display_storage_path: 'tok123/fixed-uuid-display.jpg',
    });
    expect(photo).toEqual({
      id: 'photo-1',
      guestId: 'g1',
      storagePath: 'tok123/fixed-uuid.jpg',
      displayStoragePath: 'tok123/fixed-uuid-display.jpg',
      status: 'pending',
      createdAt: '2026-06-01T00:00:00Z',
    });
  });

  it('submits with a null display path (but still submits the original) when no display blob is given', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'tok123/fixed-uuid.jpg' }, error: null });
    storageFrom.mockReturnValue({ upload });
    rpc.mockResolvedValue({
      data: [
        {
          id: 'photo-1',
          guest_id: 'g1',
          storage_path: 'tok123/fixed-uuid.jpg',
          display_storage_path: null,
          status: 'pending',
          created_at: '2026-06-01T00:00:00Z',
        },
      ],
      error: null,
    });

    await uploadPhoto('tok123', blob);

    expect(upload).toHaveBeenCalledTimes(1); // only the original, no display upload attempted
    expect(rpc).toHaveBeenCalledWith('submit_photo', {
      p_token: 'tok123',
      p_storage_path: 'tok123/fixed-uuid.jpg',
      p_display_storage_path: null,
    });
  });

  it('falls back to a null display path (without failing the whole upload) when the display upload fails', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ data: { path: 'tok123/fixed-uuid.jpg' }, error: null }) // original: succeeds
      .mockResolvedValueOnce({ data: null, error: { message: 'display bucket full' } }); // display: fails
    storageFrom.mockReturnValue({ upload });
    rpc.mockResolvedValue({
      data: [
        {
          id: 'photo-1',
          guest_id: 'g1',
          storage_path: 'tok123/fixed-uuid.jpg',
          display_storage_path: null,
          status: 'pending',
          created_at: '2026-06-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const photo = await uploadPhoto('tok123', blob, displayBlob);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('submit_photo', {
      p_token: 'tok123',
      p_storage_path: 'tok123/fixed-uuid.jpg',
      p_display_storage_path: null,
    });
    expect(photo.displayStoragePath).toBeNull();
  });

  it('throws a readable error when the original storage upload fails, without calling submit_photo', async () => {
    const upload = vi.fn().mockResolvedValue({ data: null, error: { message: 'bucket full' } });
    storageFrom.mockReturnValue({ upload });

    const failure = await uploadPhoto('tok123', blob).catch((e: Error) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('No pudimos subir la foto. Intenta de nuevo.');
    // El texto crudo de Supabase no llega a la pantalla del invitado.
    expect((failure as Error).message).not.toMatch(/bucket full/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('dice «ya usaste todos los disparos» cuando submit_photo rechaza por cupo', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'tok123/fixed-uuid.jpg' }, error: null });
    storageFrom.mockReturnValue({ upload });
    rpc.mockResolvedValue({ data: null, error: { message: 'photo quota (5) already reached', code: '22023' } });

    await expect(uploadPhoto('tok123', blob)).rejects.toThrow('Ya usaste todos los disparos de tu rollo.');
  });

  it('explica que la cámara no está habilitada cuando falta el check-in o la activación', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'tok123/fixed-uuid.jpg' }, error: null });
    storageFrom.mockReturnValue({ upload });
    rpc.mockResolvedValue({ data: null, error: { message: 'check-in required before taking photos', code: '42501' } });

    await expect(uploadPhoto('tok123', blob)).rejects.toThrow(/cámara todavía no está habilitada/);
  });

  it('con cualquier otro fallo de submit_photo no muestra el texto crudo del servidor', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'tok123/fixed-uuid.jpg' }, error: null });
    storageFrom.mockReturnValue({ upload });
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "photos_storage_path_key"', code: '23505' },
    });

    const failure = await uploadPhoto('tok123', blob).catch((e: Error) => e);
    expect((failure as Error).message).toBe('La foto se subió pero no pudimos registrarla. Avísale a quien organiza.');
    expect((failure as Error).message).not.toMatch(/duplicate key|constraint/);
  });
});

describe('listAllPhotosForModeration', () => {
  it('returns every photo with the guest full name attached', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'p1',
          guest_id: 'g1',
          storage_path: 'tok1/a.jpg',
          status: 'pending',
          created_at: '2026-06-01T00:00:00Z',
          guests: { full_name: 'Juana Pérez' },
        },
      ],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ order });
    from.mockReturnValue({ select });

    const photos = await listAllPhotosForModeration();

    expect(from).toHaveBeenCalledWith('photos');
    expect(photos).toEqual([
      {
        id: 'p1',
        guestId: 'g1',
        storagePath: 'tok1/a.jpg',
        displayStoragePath: null,
        status: 'pending',
        createdAt: '2026-06-01T00:00:00Z',
        guestFullName: 'Juana Pérez',
      },
    ]);
  });
});

describe('moderatePhoto', () => {
  it('updates the photo status and returns the updated row', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'p1', guest_id: 'g1', storage_path: 'tok1/a.jpg', status: 'approved', created_at: '2026-06-01T00:00:00Z' },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    const photo = await moderatePhoto('p1', 'approved');

    expect(from).toHaveBeenCalledWith('photos');
    expect(update).toHaveBeenCalledWith({ status: 'approved' });
    expect(eq).toHaveBeenCalledWith('id', 'p1');
    expect(photo.status).toBe('approved');
  });
});

describe('getSignedPhotoUrl', () => {
  it('creates a signed url for the storage path', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/a.jpg' }, error: null });
    storageFrom.mockReturnValue({ createSignedUrl });

    const url = await getSignedPhotoUrl('tok1/a.jpg');

    expect(storageFrom).toHaveBeenCalledWith('party-photos');
    expect(createSignedUrl).toHaveBeenCalledWith('tok1/a.jpg', expect.any(Number));
    expect(url).toBe('https://signed.example/a.jpg');
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    storageFrom.mockReturnValue({ createSignedUrl });

    await expect(getSignedPhotoUrl('tok1/a.jpg')).rejects.toThrow(/not found/);
  });

  it('devuelve tal cual las fotos de ejemplo de la vista previa, sin tocar el almacenamiento', async () => {
    storageFrom.mockClear();

    expect(await getSignedPhotoUrl(SAMPLE_PHOTOS[0].storagePath)).toBe(SAMPLE_PHOTOS[0].storagePath);
    expect(await getSignedPhotoDownloadUrl(SAMPLE_PHOTOS[1].storagePath)).toBe(SAMPLE_PHOTOS[1].storagePath);
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('cualquier otra ruta data: sigue yendo al almacenamiento: una fila manipulada no se sirve como imagen', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: 'invalid path' } });
    storageFrom.mockReturnValue({ createSignedUrl });

    await expect(getSignedPhotoUrl('data:image/svg+xml,<svg onload=alert(1)>')).rejects.toThrow(/invalid path/);
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });
});

describe('getSignedPhotoDownloadUrl', () => {
  it('creates a signed url with the download option set', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://signed.example/a.jpg?download' }, error: null });
    storageFrom.mockReturnValue({ createSignedUrl });

    const url = await getSignedPhotoDownloadUrl('tok1/a.jpg');

    expect(storageFrom).toHaveBeenCalledWith('party-photos');
    expect(createSignedUrl).toHaveBeenCalledWith('tok1/a.jpg', expect.any(Number), { download: true });
    expect(url).toBe('https://signed.example/a.jpg?download');
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    storageFrom.mockReturnValue({ createSignedUrl });

    await expect(getSignedPhotoDownloadUrl('tok1/a.jpg')).rejects.toThrow(/not found/);
  });
});

describe('listRevealedPhotos', () => {
  it('maps the storage paths, display paths and created_at returned by the RPC into approved Photo stubs', async () => {
    rpc.mockResolvedValue({
      data: [
        { storage_path: 'tok1/a.jpg', display_storage_path: 'tok1/a-display.jpg', created_at: '2026-10-09T22:15:00Z' },
        { storage_path: 'tok2/b.jpg', display_storage_path: null, created_at: '2026-10-09T23:05:00Z' },
      ],
      error: null,
    });

    const photos = await listRevealedPhotos();

    expect(rpc).toHaveBeenCalledWith('list_revealed_photos');
    expect(photos).toEqual([
      {
        id: 'tok1/a.jpg',
        guestId: '',
        storagePath: 'tok1/a.jpg',
        displayStoragePath: 'tok1/a-display.jpg',
        status: 'approved',
        createdAt: '2026-10-09T22:15:00Z',
      },
      {
        id: 'tok2/b.jpg',
        guestId: '',
        storagePath: 'tok2/b.jpg',
        displayStoragePath: null,
        status: 'approved',
        createdAt: '2026-10-09T23:05:00Z',
      },
    ]);
  });

  it('throws a readable error when supabase reports a failure', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });

    await expect(listRevealedPhotos()).rejects.toThrow(/network down/);
  });
});

describe('resolvePhotoDownload', () => {
  const PC_URL = 'https://fotos.example.me/p/ev/gu/a.jpg?exp=1800003600&sig=abc';
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Storage firma solo las rutas de `present`; las demás responden "Object not found". */
  function storageWith(present: string[]) {
    const createSignedUrl = vi.fn(async (path: string) =>
      present.includes(path)
        ? { data: { signedUrl: `https://signed.example/${path}?download` }, error: null }
        : { data: null, error: { message: 'Object not found' } },
    );
    storageFrom.mockReturnValue({ createSignedUrl });
    return createSignedUrl;
  }

  const healthy = () => fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('uses the original on the PC when it is archived and the PC answers /health', async () => {
    rpc.mockResolvedValue({ data: PC_URL, error: null });
    healthy();
    const createSignedUrl = storageWith([]);

    expect(await resolvePhotoDownload('ev/gu/a.jpg', 'ev/gu/a-display.jpg')).toEqual({ source: 'pc', url: PC_URL });
    expect(rpc).toHaveBeenCalledWith('photo_original_url', { p_storage_path: 'ev/gu/a.jpg' });
    expect(fetchMock).toHaveBeenCalledWith('https://fotos.example.me/health', expect.objectContaining({ cache: 'no-store' }));
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('uses the original in Storage when the photo is not archived yet (the RPC returns null)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    storageWith(['ev/gu/a.jpg']);

    expect(await resolvePhotoDownload('ev/gu/a.jpg', 'ev/gu/a-display.jpg')).toEqual({
      source: 'storage',
      url: 'https://signed.example/ev/gu/a.jpg?download',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to Storage when the RPC fails (for example, the migration is not applied)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function' } });
    storageWith(['ev/gu/a.jpg']);

    expect(await resolvePhotoDownload('ev/gu/a.jpg', null)).toEqual({
      source: 'storage',
      url: 'https://signed.example/ev/gu/a.jpg?download',
    });
  });

  it('still uses the original in Storage when the PC is down but the original was kept there', async () => {
    rpc.mockResolvedValue({ data: PC_URL, error: null });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    storageWith(['ev/gu/a.jpg', 'ev/gu/a-display.jpg']);

    expect(await resolvePhotoDownload('ev/gu/a.jpg', 'ev/gu/a-display.jpg')).toEqual({
      source: 'storage',
      url: 'https://signed.example/ev/gu/a.jpg?download',
    });
  });

  it('offers the light copy with a notice when the PC is down and the original left Storage', async () => {
    rpc.mockResolvedValue({ data: PC_URL, error: null });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 503 }));
    storageWith(['ev/gu/a-display.jpg']);

    expect(await resolvePhotoDownload('ev/gu/a.jpg', 'ev/gu/a-display.jpg')).toEqual({
      source: 'display',
      url: 'https://signed.example/ev/gu/a-display.jpg?download',
      notice: 'El equipo con las fotos originales no responde. Te bajamos una copia liviana; vuelve a intentarlo más tarde para tenerla en calidad original.',
    });
  });

  it('treats a /health that answers 200 without ok: true, or does not answer in time, as down', async () => {
    rpc.mockResolvedValue({ data: PC_URL, error: null });
    storageWith(['ev/gu/a-display.jpg']);

    fetchMock.mockResolvedValue(new Response('<html>Cloudflare</html>', { status: 200 }));
    expect((await resolvePhotoDownload('ev/gu/a.jpg', 'ev/gu/a-display.jpg')).source).toBe('display');

    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
      );
      const pending = resolvePhotoDownload('ev/gu/a.jpg', 'ev/gu/a-display.jpg');
      await vi.advanceTimersByTimeAsync(5000);
      expect((await pending).source).toBe('display');
    } finally {
      vi.useRealTimers();
    }
  });

  it('never trusts a non-https link from the RPC', async () => {
    rpc.mockResolvedValue({ data: 'http://fotos.example.me/p/ev/gu/a.jpg?exp=1&sig=a', error: null });
    healthy();
    storageWith(['ev/gu/a-display.jpg']);

    expect((await resolvePhotoDownload('ev/gu/a.jpg', 'ev/gu/a-display.jpg')).source).toBe('display');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers the light copy with another notice when the original is missing and the PC is not configured', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    storageWith(['ev/gu/a-display.jpg']);

    expect(await resolvePhotoDownload('ev/gu/a.jpg', 'ev/gu/a-display.jpg')).toEqual({
      source: 'display',
      url: 'https://signed.example/ev/gu/a-display.jpg?download',
      notice: 'No encontramos la foto original. Te bajamos una copia liviana.',
    });
  });

  it('reports the photo as unavailable when there is neither original nor light copy', async () => {
    rpc.mockResolvedValue({ data: PC_URL, error: null });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    storageWith([]);

    expect(await resolvePhotoDownload('ev/gu/a.jpg', null)).toEqual({
      source: 'unavailable',
      notice: 'No pudimos descargar esta foto. Vuelve a intentarlo más tarde.',
    });
  });

  it('returns sample photos as they are, without calling Supabase', async () => {
    expect(await resolvePhotoDownload(SAMPLE_PHOTOS[0].storagePath, null)).toEqual({
      source: 'storage',
      url: SAMPLE_PHOTOS[0].storagePath,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
