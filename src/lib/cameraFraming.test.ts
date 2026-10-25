import { describe, expect, it } from 'vitest';
import { LANDSCAPE_ASPECT, PORTRAIT_ASPECT, aspectForOrientation, coverCrop } from './cameraFraming';

describe('aspectForOrientation', () => {
  it('3:4 en vertical y 4:3 en horizontal', () => {
    expect(aspectForOrientation('portrait')).toBe(PORTRAIT_ASPECT);
    expect(aspectForOrientation('landscape')).toBe(LANDSCAPE_ASPECT);
    expect(PORTRAIT_ASPECT * LANDSCAPE_ASPECT).toBeCloseTo(1, 10);
  });
});

describe('coverCrop', () => {
  it('un video que ya tiene la proporción no se recorta', () => {
    expect(coverCrop(480, 640, PORTRAIT_ASPECT)).toEqual({ sx: 0, sy: 0, sw: 480, sh: 640 });
  });

  it('un video 9:16 en un encuadre 3:4 pierde arriba y abajo, centrado', () => {
    const c = coverCrop(1080, 1920, PORTRAIT_ASPECT);
    expect(c.sx).toBe(0);
    expect(c.sw).toBe(1080);
    expect(c.sh).toBeCloseTo(1440, 6); // 1080 / (3/4)
    expect(c.sy).toBeCloseTo((1920 - 1440) / 2, 6);
  });

  it('un video 4:3 apaisado en un encuadre 3:4 pierde los costados, centrado', () => {
    const c = coverCrop(640, 480, PORTRAIT_ASPECT);
    expect(c.sy).toBe(0);
    expect(c.sh).toBe(480);
    expect(c.sw).toBeCloseTo(360, 6); // 480 × 3/4
    expect(c.sx).toBeCloseTo(140, 6);
  });

  it('un video cuadrado se recorta según el encuadre pedido', () => {
    const v = coverCrop(600, 600, PORTRAIT_ASPECT);
    expect(v.sw / v.sh).toBeCloseTo(PORTRAIT_ASPECT, 10);
    const h = coverCrop(600, 600, LANDSCAPE_ASPECT);
    expect(h.sw / h.sh).toBeCloseTo(LANDSCAPE_ASPECT, 10);
  });

  it.each([
    [1080, 1920, PORTRAIT_ASPECT],
    [1920, 1080, PORTRAIT_ASPECT],
    [640, 480, LANDSCAPE_ASPECT],
    [1080, 1920, LANDSCAPE_ASPECT],
  ])('%i×%i → %f: el recorte tiene la proporción pedida y cabe dentro del origen', (w, h, aspect) => {
    const c = coverCrop(w, h, aspect);
    expect(c.sw / c.sh).toBeCloseTo(aspect, 8);
    expect(c.sx).toBeGreaterThanOrEqual(0);
    expect(c.sy).toBeGreaterThanOrEqual(0);
    expect(c.sx + c.sw).toBeLessThanOrEqual(w + 1e-9);
    expect(c.sy + c.sh).toBeLessThanOrEqual(h + 1e-9);
  });

  it('con datos inválidos devuelve el cuadro completo sin romperse', () => {
    expect(coverCrop(0, 0, 0.75)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
    expect(coverCrop(640, 480, 0)).toEqual({ sx: 0, sy: 0, sw: 640, sh: 480 });
    expect(coverCrop(640, 480, Number.NaN)).toEqual({ sx: 0, sy: 0, sw: 640, sh: 480 });
  });
});
