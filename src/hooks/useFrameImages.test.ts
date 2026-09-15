import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFrameImages } from './useFrameImages';
import { FRAME_IMAGE_SRC } from '../lib/cameraFrames';

/**
 * Mockea el constructor global `Image` -- jsdom no descarga imágenes de
 * verdad, así que se reemplaza por una clase falsa que guarda cada
 * instancia creada (indexada por el `src` que se le asignó) y expone un
 * helper para disparar su `onload` a mano, simulando que la red terminó.
 */
function mockImageConstructor() {
  const instances: { src: string; fire: () => void }[] = [];

  class FakeImage {
    onload: (() => void) | null = null;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      instances.push({ src: value, fire: () => this.onload?.() });
    }
  }

  vi.stubGlobal('Image', FakeImage);
  return instances;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFrameImages', () => {
  it('kicks off loading all 7 frame image paths on mount', () => {
    const instances = mockImageConstructor();

    renderHook(() => useFrameImages());

    const loadedSrcs = instances.map((i) => i.src).sort();
    const expectedSrcs = Object.values(FRAME_IMAGE_SRC).sort();
    expect(loadedSrcs).toEqual(expectedSrcs);
    expect(instances).toHaveLength(7);
  });

  it('exposes an image only once its onload has fired, keyed by frame id', () => {
    const instances = mockImageConstructor();

    const { result } = renderHook(() => useFrameImages());

    expect(result.current.disposable).toBeUndefined();

    const disposableInstance = instances.find((i) => i.src === FRAME_IMAGE_SRC.disposable);
    act(() => disposableInstance?.fire());

    expect(result.current.disposable).toBeDefined();
    expect(result.current['date-stamp']).toBeUndefined();
  });

  it('exposes every image once all of them have loaded', () => {
    const instances = mockImageConstructor();

    const { result } = renderHook(() => useFrameImages());
    act(() => instances.forEach((i) => i.fire()));

    for (const id of Object.keys(FRAME_IMAGE_SRC)) {
      expect(result.current[id as keyof typeof FRAME_IMAGE_SRC]).toBeDefined();
    }
  });
});
