import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createMockCtx } from '../test/mockCanvas';

vi.mock('../lib/platformGuestApi', () => ({
  listCameraAssets: vi.fn(),
  getStickerImageUrl: vi.fn(),
}));

import { getStickerImageUrl, listCameraAssets } from '../lib/platformGuestApi';
import { loadImage, useCameraAssets } from './useCameraAssets';

const frames = [
  { id: 'f1', label: 'Borde', template: 'border' as const, params: { primaryColor: '#112233' }, isDefault: false },
  { id: 'f2', label: 'Título', template: 'banner' as const, params: { title: 'Hola' }, isDefault: true },
];

// Imagen que "carga" al instante, o que falla si la URL contiene "roto".
class FakeImage {
  crossOrigin = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 10;
  height = 10;
  set src(url: string) {
    queueMicrotask(() => (url.includes('roto') ? this.onerror?.() : this.onload?.()));
  }
}

beforeEach(() => {
  vi.mocked(listCameraAssets).mockReset();
  vi.mocked(getStickerImageUrl).mockReset().mockImplementation(async (path) => `https://cdn/${path}`);
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => vi.unstubAllGlobals());

describe('useCameraAssets', () => {
  it('no carga nada mientras la cámara está bloqueada', () => {
    const { result } = renderHook(() => useCameraAssets('tok', false));
    expect(result.current.status).toBe('idle');
    expect(listCameraAssets).not.toHaveBeenCalled();
  });

  it('convierte marcos en funciones de dibujo y marca el marco por defecto', async () => {
    vi.mocked(listCameraAssets).mockResolvedValue({ frames, stickers: [] });
    const { result } = renderHook(() => useCameraAssets('tok', true));
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.frames.map((f) => f.label)).toEqual(['Borde', 'Título']);
    expect(result.current.initialFrameId).toBe('f2');

    const m = createMockCtx();
    result.current.frames[1].draw!(m.ctx, 600, 800);
    expect(m.texts()).toEqual(['Hola']);
  });

  it('emojis quedan listos y las imágenes se cargan con crossOrigin anónimo', async () => {
    vi.mocked(listCameraAssets).mockResolvedValue({
      frames: [],
      stickers: [
        { id: 's1', kind: 'emoji', emoji: '🎉', storagePath: null },
        { id: 's2', kind: 'image', emoji: null, storagePath: 'ev/stickers/a.webp' },
      ],
    });
    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const [emoji, image] = result.current.stickers;
    expect(emoji.asset).toEqual({ kind: 'emoji', emoji: '🎉' });
    expect(image.asset.kind).toBe('image');
    expect(image.previewSrc).toBe('https://cdn/ev/stickers/a.webp');
    expect((image.asset as { image: FakeImage }).image.crossOrigin).toBe('anonymous');
    expect(result.current.initialFrameId).toBeNull();
  });

  it('un sticker cuya imagen no carga se omite, sin romper el resto', async () => {
    vi.mocked(listCameraAssets).mockResolvedValue({
      frames: [],
      stickers: [
        { id: 's1', kind: 'emoji', emoji: '🎉', storagePath: null },
        { id: 's2', kind: 'image', emoji: null, storagePath: 'ev/roto.webp' },
        { id: 's3', kind: 'image', emoji: null, storagePath: 'ev/sin-firma.webp' },
      ],
    });
    vi.mocked(getStickerImageUrl).mockImplementation(async (path) => {
      if (path.includes('sin-firma')) throw new Error('no firma');
      return `https://cdn/${path}`;
    });

    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.stickers.map((s) => s.id)).toEqual(['s1']);
  });

  it('si falla la carga, queda en error con listas vacías (la cámara igual se puede abrir)', async () => {
    vi.mocked(listCameraAssets).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.frames).toEqual([]);
    expect(result.current.stickers).toEqual([]);
  });

  it('descarta el resultado si el componente se desmonta antes de terminar', async () => {
    let resolve!: (v: { frames: typeof frames; stickers: never[] }) => void;
    vi.mocked(listCameraAssets).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useCameraAssets('tok', true));
    unmount();
    resolve({ frames, stickers: [] });
    await Promise.resolve();
    expect(result.current.status).toBe('loading');
  });
});

describe('loadImage', () => {
  it('resuelve con la imagen y pide CORS anónimo', async () => {
    const image = await loadImage('https://cdn/a.webp');
    expect(image.crossOrigin).toBe('anonymous');
  });

  it('rechaza si la imagen no carga', async () => {
    await expect(loadImage('https://cdn/roto.webp')).rejects.toThrow();
  });
});
