import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/cameraAssets/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/cameraAssets/layers')>()),
  prepareFrameAssets: vi.fn(),
}));

import { prepareFrameAssets, type FrameLayer } from '../lib/cameraAssets/layers';
import { useLayerAssets } from './useLayerAssets';

const EVENT = '123e4567-e89b-42d3-a456-426614174000';
const IMAGE = `${EVENT}/frames/overlay.png`;
const resolveUrl = vi.fn(async (path: string) => `https://cdn/${path}`);

const rect: FrameLayer = { type: 'shape', shape: 'rect', x: 0.5, y: 0.5, w: 0.5, h: 0.5, fill: '#111111' };
const image: FrameLayer = { type: 'image', src: IMAGE, full: true };
const webText: FrameLayer = { type: 'text', text: 'Martina', font: 'anton' };
const systemText: FrameLayer = { type: 'text', text: 'Martina', font: 'sans' };

const assets = { images: new Map([[IMAGE, {} as CanvasImageSource]]) };

beforeEach(() => {
  vi.mocked(prepareFrameAssets).mockReset().mockResolvedValue(assets);
  resolveUrl.mockClear();
});

describe('useLayerAssets', () => {
  it('sin imágenes ni tipografías web no carga nada', () => {
    const { result } = renderHook(() => useLayerAssets([rect, systemText], resolveUrl));
    expect(result.current).toBeUndefined();
    expect(prepareFrameAssets).not.toHaveBeenCalled();
  });

  it('carga las imágenes de las capas con la función que resuelve las URL', async () => {
    const { result } = renderHook(() => useLayerAssets([rect, image], resolveUrl));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(assets));
    expect(prepareFrameAssets).toHaveBeenCalledWith([rect, image], resolveUrl);
  });

  it('una tipografía web también dispara la carga (el canvas necesita la fuente lista)', async () => {
    const { result } = renderHook(() => useLayerAssets([webText], resolveUrl));
    await waitFor(() => expect(result.current).toBe(assets));
    expect(prepareFrameAssets).toHaveBeenCalledTimes(1);
  });

  it('mover o recolorear capas no vuelve a cargar; agregar otra imagen sí', async () => {
    const { result, rerender } = renderHook(({ layers }) => useLayerAssets(layers, resolveUrl), {
      initialProps: { layers: [rect, image] as unknown },
    });
    await waitFor(() => expect(result.current).toBe(assets));

    rerender({ layers: [{ ...rect, x: 0.9, fill: '#ff0000' }, image] });
    expect(prepareFrameAssets).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(assets);

    const other = { ...image, src: `${EVENT}/frames/otra.png` };
    rerender({ layers: [rect, image, other] });
    await waitFor(() => expect(prepareFrameAssets).toHaveBeenCalledTimes(2));
  });

  it('al quitar la última imagen vuelve a undefined', async () => {
    const { result, rerender } = renderHook(({ layers }) => useLayerAssets(layers, resolveUrl), {
      initialProps: { layers: [image] as unknown },
    });
    await waitFor(() => expect(result.current).toBe(assets));
    rerender({ layers: [rect] });
    expect(result.current).toBeUndefined();
  });

  it('ignora capas inválidas y no revienta con basura', () => {
    const { result } = renderHook(() => useLayerAssets('no es una lista', resolveUrl));
    expect(result.current).toBeUndefined();
    expect(prepareFrameAssets).not.toHaveBeenCalled();
  });

  it('una capa asset dispara la carga y recarga si cambia su tint', async () => {
    const assetLayer: FrameLayer = { type: 'asset', asset: 'pack:halloween-neon/murcielago', w: 0.2, h: 0.2, tint: '#ff2f92' };
    const { result, rerender } = renderHook(({ layers }) => useLayerAssets(layers), {
      initialProps: { layers: [assetLayer] as unknown },
    });
    await waitFor(() => expect(result.current).toBe(assets));
    expect(prepareFrameAssets).toHaveBeenCalledTimes(1);

    rerender({ layers: [{ ...assetLayer, x: 0.8 }] });
    expect(prepareFrameAssets).toHaveBeenCalledTimes(1);

    rerender({ layers: [{ ...assetLayer, tint: '#c8f23a' }] });
    await waitFor(() => expect(prepareFrameAssets).toHaveBeenCalledTimes(2));
  });
});
