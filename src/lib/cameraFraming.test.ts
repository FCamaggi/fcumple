import { describe, expect, it } from 'vitest';
import { LANDSCAPE_ASPECT, PORTRAIT_ASPECT, aspectForOrientation, coverCrop, frameFitsAspect } from './cameraFraming';

describe('frameFitsAspect', () => {
  it('un marco sin proporción propia (capas) sirve siempre', () => {
    expect(frameFitsAspect(undefined, PORTRAIT_ASPECT)).toBe(true);
    expect(frameFitsAspect(undefined, LANDSCAPE_ASPECT)).toBe(true);
  });

  it('un marco de imagen solo calza con la proporción de la foto', () => {
    expect(frameFitsAspect(1086 / 1448, PORTRAIT_ASPECT)).toBe(true); // 3:4 de ChatGPT
    expect(frameFitsAspect(2400 / 1792, LANDSCAPE_ASPECT)).toBe(true); // 4:3 de Gemini (1,339)
    expect(frameFitsAspect(1536 / 2752, PORTRAIT_ASPECT)).toBe(false); // 9:16 (0,558)
    expect(frameFitsAspect(1, PORTRAIT_ASPECT)).toBe(false); // 1:1
    expect(frameFitsAspect(1, LANDSCAPE_ASPECT)).toBe(false);
    expect(frameFitsAspect(LANDSCAPE_ASPECT, PORTRAIT_ASPECT)).toBe(false); // un 4:3 en la cámara vertical
    expect(frameFitsAspect(PORTRAIT_ASPECT, LANDSCAPE_ASPECT)).toBe(false);
  });

  it('con datos inválidos no esconde el marco', () => {
    expect(frameFitsAspect(0, PORTRAIT_ASPECT)).toBe(true);
    expect(frameFitsAspect(0.75, 0)).toBe(true);
  });
});

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
