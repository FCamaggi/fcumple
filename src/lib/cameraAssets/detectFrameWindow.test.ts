import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockCtx } from '../../test/mockCanvas';
import { DETECT_MAX_SIDE, detectFrameWindow } from './detectFrameWindow';

/** Arma un RGBA de w×h opaco con huecos transparentes en los rectángulos dados (en píxeles). */
function rgba(w: number, h: number, holes: Array<[number, number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x0, y0, hw, hh] of holes) {
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + hw; x++) data[(y * w + x) * 4 + 3] = 0;
  }
  return data;
}

describe('detectFrameWindow', () => {
  let mock: ReturnType<typeof createMockCtx>;
  let getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray; width: number; height: number };

  beforeEach(() => {
    mock = createMockCtx();
    getImageData = (_x, _y, w, h) => ({ data: rgba(w, h, []), width: w, height: h });
    const ctx = new Proxy(mock.ctx, {
      get(target, prop, receiver) {
        if (prop === 'getImageData') return getImageData;
        return Reflect.get(target, prop, receiver);
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  });

  it('devuelve null cuando detectWindow no encuentra una ventana en la imagen', () => {
    const img = { naturalWidth: 100, naturalHeight: 100 } as unknown as CanvasImageSource;
    getImageData = () => ({ data: rgba(100, 100, []), width: 100, height: 100 });

    expect(detectFrameWindow(img, 100, 100)).toBeNull();
  });

  it('escala la imagen para que el lado mayor sea a lo sumo 256 px y devuelve el rectángulo normalizado', () => {
    const img = { naturalWidth: 1200, naturalHeight: 1600 } as unknown as CanvasImageSource;
    // 1200×1600 escalado con tope 256 -> 192×256
    const w = 192;
    const h = 256;
    getImageData = (_x, _y, cw, ch) => ({
      data: rgba(cw, ch, [[38, 64, 96, 128]]),
      width: cw,
      height: ch,
    });

    const rect = detectFrameWindow(img, 1200, 1600);
    expect(DETECT_MAX_SIDE).toBe(256);
    expect(mock.calls).toContainEqual({ name: 'drawImage', args: [img, 0, 0, w, h] });
    expect(rect).toEqual({
      x: 38 / w,
      y: 64 / h,
      w: 96 / w,
      h: 128 / h,
    });
  });

  it('no falla si el canvas está contaminado por CORS o no tiene dimensiones válidas', () => {
    const img = { naturalWidth: 200, naturalHeight: 200 } as unknown as CanvasImageSource;
    getImageData = () => {
      throw new Error('SecurityError');
    };

    expect(detectFrameWindow(img, 200, 200)).toBeNull();
    expect(detectFrameWindow(img, 0, 200)).toBeNull();
  });
});
