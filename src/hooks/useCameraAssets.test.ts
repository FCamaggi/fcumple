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
  { id: 'f1', label: 'Borde', template: 'capas' as const, params: { layers: [] }, isDefault: false },
  { id: 'f2', label: 'Título', template: 'capas' as const, params: { layers: [{ type: 'text' as const, text: 'Hola', font: 'display' as const, color: '#ffffff' }] }, isDefault: true },
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
    result.current.frames[1].draw!(m.ctx, 600, 800, '3:4');
    expect(m.texts()).toEqual(['Hola']);
  });

  it('un marco de capas carga sus imágenes con URL firmada y las dibuja; el resto de las capas también', async () => {
    const src = '123e4567-e89b-42d3-a456-426614174000/frames/overlay.png';
    vi.mocked(listCameraAssets).mockResolvedValue({
      frames: [
        {
          id: 'f3',
          label: 'Fran',
          template: 'capas' as const,
          isDefault: false,
          params: {
            layers: [
              { type: 'image', src, full: true },
              { type: 'text', text: 'Cumpleaños Fran', font: 'sans' },
            ],
          },
        },
      ],
      stickers: [],
    });
    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(getStickerImageUrl).toHaveBeenCalledWith(src);
    const m = createMockCtx();
    result.current.frames[0].draw!(m.ctx, 600, 800, '3:4');
    expect(m.count('drawImage')).toBe(1);
    expect(m.texts()).toEqual(['Cumpleaños Fran']);
  });

  it('si la imagen de una capa no carga, el marco se dibuja igual sin ella', async () => {
    const src = '123e4567-e89b-42d3-a456-426614174000/frames/rota.png';
    vi.mocked(listCameraAssets).mockResolvedValue({
      frames: [
        {
          id: 'f3',
          label: 'Fran',
          template: 'capas' as const,
          isDefault: false,
          params: { layers: [{ type: 'image', src, full: true }, { type: 'text', text: 'Hola', font: 'sans' }] },
        },
      ],
      stickers: [],
    });
    vi.mocked(getStickerImageUrl).mockImplementation(async (path) => `https://cdn/roto/${path}`);

    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const m = createMockCtx();
    result.current.frames[0].draw!(m.ctx, 600, 800, '3:4');
    expect(m.count('drawImage')).toBe(0);
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

  it('usa la función de carga provista en vez de listCameraAssets cuando se especifica', async () => {
    const customLoader = vi.fn().mockResolvedValue({
      frames: [{ id: 'cf1', label: 'Marco propio', template: 'capas' as const, params: {}, isDefault: true }],
      stickers: [{ id: 'cs1', kind: 'emoji' as const, emoji: '🎈', storagePath: null }],
    });
    const { result } = renderHook(() => useCameraAssets('ev-1', true, customLoader));
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(customLoader).toHaveBeenCalledTimes(1);
    expect(listCameraAssets).not.toHaveBeenCalled();
    expect(result.current.frames.map((f) => f.label)).toEqual(['Marco propio']);
    expect(result.current.initialFrameId).toBe('cf1');
    expect(result.current.stickers[0].asset).toEqual({ kind: 'emoji', emoji: '🎈' });
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

describe('useCameraAssets: un diseño por proporción', () => {
  const ev = '123e4567-e89b-42d3-a456-426614174000';
  const img34 = `${ev}/frames/tres-cuatro.png`;
  const img11 = `${ev}/frames/cuadrado.png`;
  const label = (text: string) => ({ type: 'text' as const, text, font: 'sans' as const });
  const variantFrame = {
    id: 'v1',
    label: 'Por proporción',
    template: 'capas' as const,
    isDefault: false,
    params: {
      layers: [label('Vertical')],
      variants: {
        '3:4': { layers: [{ type: 'image' as const, src: img34, full: true }, label('Vertical')] },
        '1:1': { layers: [{ type: 'image' as const, src: img11, full: true }, label('Cuadrado')] },
      },
    },
  };

  it('cada marco declara en `ratios` las proporciones donde tiene diseño, sin cargar imágenes', async () => {
    vi.mocked(listCameraAssets).mockResolvedValue({
      frames: [
        variantFrame,
        { id: 'viejo', label: 'Antiguo', template: 'capas' as const, isDefault: false, params: { layers: [label('Hola')] } },
        { id: 'vacio', label: 'Vacío', template: 'capas' as const, isDefault: false, params: {} },
      ],
      stickers: [],
    });
    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const [conVariantes, antiguo, vacio] = result.current.frames;
    expect(conVariantes.ratios).toEqual(['3:4', '1:1']);
    expect(antiguo.ratios).toEqual(['3:4', '4:3', '9:16', '1:1']); // sin variantes, `layers` vale para todas (orden de VARIANT_RATIOS)
    expect(vacio.ratios).toEqual([]);
  });

  it('dibuja las capas de la proporción pedida', async () => {
    vi.mocked(listCameraAssets).mockResolvedValue({ frames: [variantFrame], stickers: [] });
    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await result.current.frames[0].ensure!('1:1');

    const vertical = createMockCtx();
    result.current.frames[0].draw!(vertical.ctx, 600, 800, '3:4');
    expect(vertical.texts()).toEqual(['Vertical']);

    const cuadrado = createMockCtx();
    result.current.frames[0].draw!(cuadrado.ctx, 600, 600, '1:1');
    expect(cuadrado.texts()).toEqual(['Cuadrado']);
  });

  it('carga ya las imágenes de 3:4 y las demás proporciones solo al pedirlas con ensure', async () => {
    vi.mocked(listCameraAssets).mockResolvedValue({ frames: [variantFrame], stickers: [] });
    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(getStickerImageUrl).toHaveBeenCalledWith(img34);
    expect(getStickerImageUrl).not.toHaveBeenCalledWith(img11);
    const antes = createMockCtx();
    result.current.frames[0].draw!(antes.ctx, 600, 600, '1:1');
    expect(antes.count('drawImage')).toBe(0); // todavía no se cargó

    await result.current.frames[0].ensure!('1:1');
    expect(getStickerImageUrl).toHaveBeenCalledWith(img11);
    const despues = createMockCtx();
    result.current.frames[0].draw!(despues.ctx, 600, 600, '1:1');
    expect(despues.count('drawImage')).toBe(1);
  });

  it('ensure es idempotente: no vuelve a firmar ni cargar lo ya cargado', async () => {
    vi.mocked(listCameraAssets).mockResolvedValue({ frames: [variantFrame], stickers: [] });
    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await Promise.all([result.current.frames[0].ensure!('1:1'), result.current.frames[0].ensure!('1:1')]);
    await result.current.frames[0].ensure!('1:1');
    await result.current.frames[0].ensure!('3:4');
    const llamadas = vi.mocked(getStickerImageUrl).mock.calls.filter(([p]) => p === img11);
    expect(llamadas).toHaveLength(1);
  });

  it('ensure de una proporción sin diseño no falla ni dibuja nada', async () => {
    vi.mocked(listCameraAssets).mockResolvedValue({ frames: [variantFrame], stickers: [] });
    const { result } = renderHook(() => useCameraAssets('tok', true));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await expect(result.current.frames[0].ensure!('9:16')).resolves.toBeUndefined();
    const m = createMockCtx();
    result.current.frames[0].draw!(m.ctx, 540, 960, '9:16');
    expect(m.texts()).toEqual([]);
    expect(m.count('drawImage')).toBe(0);
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
