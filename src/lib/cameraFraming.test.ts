import { describe, expect, it } from 'vitest';
import {
  LANDSCAPE_ASPECT,
  PORTRAIT_ASPECT,
  aspectForOrientation,
  coverCrop,
  defaultRatio,
  ratioAspect,
  ratiosForOrientation,
  resolveRatio,
} from './cameraFraming';

describe('proporciones que ofrece la cámara', () => {
  it('en vertical 3:4, 1:1 o 9:16; en horizontal solo 4:3 o 1:1', () => {
    expect(ratiosForOrientation('portrait')).toEqual(['3:4', '1:1', '9:16']);
    expect(ratiosForOrientation('landscape')).toEqual(['4:3', '1:1']);
  });

  it('la proporción por defecto es 3:4 en vertical y 4:3 en horizontal', () => {
    expect(defaultRatio('portrait')).toBe('3:4');
    expect(defaultRatio('landscape')).toBe('4:3');
    expect(ratioAspect(defaultRatio('portrait'))).toBe(PORTRAIT_ASPECT);
    expect(ratioAspect(defaultRatio('landscape'))).toBe(LANDSCAPE_ASPECT);
  });

  it('ratioAspect devuelve ancho / alto', () => {
    expect(ratioAspect('3:4')).toBeCloseTo(0.75, 10);
    expect(ratioAspect('4:3')).toBeCloseTo(4 / 3, 10);
    expect(ratioAspect('1:1')).toBe(1);
    expect(ratioAspect('9:16')).toBeCloseTo(9 / 16, 10);
  });

  it('resolveRatio conserva la elegida si la orientación la permite y si no vuelve a la por defecto', () => {
    expect(resolveRatio('portrait', undefined)).toBe('3:4');
    expect(resolveRatio('landscape', undefined)).toBe('4:3');
    expect(resolveRatio('portrait', '9:16')).toBe('9:16');
    expect(resolveRatio('portrait', '1:1')).toBe('1:1');
    expect(resolveRatio('landscape', '1:1')).toBe('1:1'); // 1:1 sobrevive a girar el teléfono
    expect(resolveRatio('landscape', '9:16')).toBe('4:3'); // 9:16 no existe acostado
    expect(resolveRatio('portrait', '4:3')).toBe('3:4'); // ni 4:3 de pie
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
