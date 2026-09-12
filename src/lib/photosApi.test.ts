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
  listRevealedPhotos,
} from './photosApi';

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

  it('uploads the blob to storage under {token}/{uuid}.jpg and registers it via submit_photo', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'tok123/fixed-uuid.jpg' }, error: null });
    storageFrom.mockReturnValue({ upload });
    rpc.mockResolvedValue({
      data: [{ id: 'photo-1', guest_id: 'g1', storage_path: 'tok123/fixed-uuid.jpg', status: 'pending', created_at: '2026-06-01T00:00:00Z' }],
      error: null,
    });

    const photo = await uploadPhoto('tok123', blob);

    expect(storageFrom).toHaveBeenCalledWith('party-photos');
    expect(upload).toHaveBeenCalledWith('tok123/fixed-uuid.jpg', blob, { contentType: 'image/jpeg' });
    expect(rpc).toHaveBeenCalledWith('submit_photo', { p_token: 'tok123', p_storage_path: 'tok123/fixed-uuid.jpg' });
    expect(photo).toEqual({
      id: 'photo-1',
      guestId: 'g1',
      storagePath: 'tok123/fixed-uuid.jpg',
      status: 'pending',
      createdAt: '2026-06-01T00:00:00Z',
    });
  });

  it('throws a readable error when the storage upload fails, without calling submit_photo', async () => {
    const upload = vi.fn().mockResolvedValue({ data: null, error: { message: 'bucket full' } });
    storageFrom.mockReturnValue({ upload });

    await expect(uploadPhoto('tok123', blob)).rejects.toThrow(/bucket full/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('throws a readable error when submit_photo fails after a successful upload', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'tok123/fixed-uuid.jpg' }, error: null });
    storageFrom.mockReturnValue({ upload });
    rpc.mockResolvedValue({ data: null, error: { message: 'quota reached', code: '22023' } });

    await expect(uploadPhoto('tok123', blob)).rejects.toThrow(/quota reached|cupo/i);
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
});

// listRevealedPhotos assumes a `list_revealed_photos` RPC that does not
// exist yet in supabase/migrations/ (see the note above its implementation
// in photosApi.ts) -- these tests only pin down the shape this function
// exposes to the frontend, not that the RPC is live in production today.
describe('listRevealedPhotos', () => {
  it('maps the storage paths returned by the RPC into approved Photo stubs', async () => {
    rpc.mockResolvedValue({ data: [{ storage_path: 'tok1/a.jpg' }, { storage_path: 'tok2/b.jpg' }], error: null });

    const photos = await listRevealedPhotos();

    expect(rpc).toHaveBeenCalledWith('list_revealed_photos');
    expect(photos).toEqual([
      { id: 'tok1/a.jpg', guestId: '', storagePath: 'tok1/a.jpg', status: 'approved', createdAt: '' },
      { id: 'tok2/b.jpg', guestId: '', storagePath: 'tok2/b.jpg', status: 'approved', createdAt: '' },
    ]);
  });

  it('throws a readable error when the RPC does not exist yet (undefined function)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function list_revealed_photos() does not exist', code: '42883' } });

    await expect(listRevealedPhotos()).rejects.toThrow(/does not exist/);
  });
});
