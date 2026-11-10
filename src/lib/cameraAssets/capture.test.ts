import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPTURE_SCALE,
  OUTPUT_MAX_AREA,
  OUTPUT_MAX_SIDE,
  clampCaptureScale,
  detectWindow,
  frameCapture,
  maxCaptureScale,
  outputSize,
  photoAspect,
  photoBox,
  windowAt,
} from './capture';
import type { FrameLayer } from './layers';

const EV = '123e4567-e89b-42d3-a456-426614174000';
const img = `${EV}/frames/marco.webp`;

describe('frameCapture: la ventana sale de la imagen de borde a borde', () => {
  it('devuelve la ventana de la primera imagen full que la tenga', () => {
    const cap = { x: 0.1, y: 0.2, w: 0.6, h: 0.5, scale: 1.2 };
    const layers: FrameLayer[] = [
      { type: 'text', text: 'Hola', x: 0.5, y: 0.9 },
      { type: 'image', src: img, full: true, capture: cap },
    ];
    expect(frameCapture(layers)).toEqual(cap);
  });

  it('sin ventana (marcos de capas o PNG transparentes) devuelve null: la foto llena el lienzo como antes', () => {
    expect(frameCapture([{ type: 'image', src: img, full: true }])).toBeNull();
    expect(frameCapture([])).toBeNull();
    expect(frameCapture(undefined)).toBeNull();
  });
});

describe('photoBox: la foto mide la ventana por la escala, centrada en la ventana', () => {
  it('escala 1: la foto calza justo en la ventana', () => {
    expect(photoBox({ x: 0.2, y: 0.3, w: 0.4, h: 0.5, scale: 1 })).toEqual({ x: 0.2, y: 0.3, w: 0.4, h: 0.5 });
  });

  it('escala 1,5: crece desde el centro de la ventana', () => {
    const b = photoBox({ x: 0.2, y: 0.3, w: 0.4, h: 0.4, scale: 1.5 });
    expect(b.w).toBeCloseTo(0.6, 10);
    expect(b.h).toBeCloseTo(0.6, 10);
    expect(b.x + b.w / 2).toBeCloseTo(0.4, 10);
    expect(b.y + b.h / 2).toBeCloseTo(0.5, 10);
  });

  it('con la ventana cerca de un borde la caja se recorta al lienzo: nada de la foto queda fuera', () => {
    // Sin recorte iría de x = -0,025 a 0,425; la parte fuera del lienzo no saldría en la foto.
    const b = photoBox({ x: 0.05, y: 0.3, w: 0.3, h: 0.4, scale: 1.5 });
    expect(b.x).toBe(0);
    expect(b.w).toBeCloseTo(0.425, 10);
    expect(b.y).toBeCloseTo(0.2, 10);
    expect(b.h).toBeCloseTo(0.6, 10);
  });

  it('la caja recortada sigue cubriendo toda la ventana', () => {
    const cap = { x: 0.6, y: 0.05, w: 0.38, h: 0.3, scale: 1.8 };
    const b = photoBox(cap);
    expect(b.x).toBeLessThanOrEqual(cap.x);
    expect(b.y).toBeLessThanOrEqual(cap.y);
    expect(b.x + b.w).toBeGreaterThanOrEqual(cap.x + cap.w);
    expect(b.y + b.h).toBeGreaterThanOrEqual(cap.y + cap.h);
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    expect(b.y).toBeGreaterThanOrEqual(0);
  });

  it('una escala por encima del máximo se recorta al máximo', () => {
    const cap = { x: 0.25, y: 0.25, w: 0.5, h: 0.5, scale: 9 };
    expect(photoBox(cap)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('maxCaptureScale: donde la foto ya cubre todo el lienzo', () => {
  it('ventana centrada a la mitad: 2', () => {
    expect(maxCaptureScale({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })).toBeCloseTo(2, 10);
  });

  it('ventana corrida: manda el lado más lejano', () => {
    // horizontal: centro 0,3, medio ancho 0,2 → hasta el borde derecho 0,7 / 0,2 = 3,5
    // vertical: centro 0,5, media altura 0,1 → 0,5 / 0,1 = 5 (manda este)
    expect(maxCaptureScale({ x: 0.1, y: 0.4, w: 0.4, h: 0.2 })).toBeCloseTo(5, 10);
  });

  it('ventana del lienzo entero: 1', () => {
    expect(maxCaptureScale({ x: 0, y: 0, w: 1, h: 1 })).toBe(1);
  });

  it('nunca pasa de 10', () => {
    expect(maxCaptureScale({ x: 0, y: 0, w: 0.03, h: 0.03 })).toBe(10);
  });

  it('clampCaptureScale deja la escala entre 1 y el máximo', () => {
    const win = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    expect(clampCaptureScale(win, 0.5)).toBe(1);
    expect(clampCaptureScale(win, 1.3)).toBe(1.3);
    expect(clampCaptureScale(win, 5)).toBeCloseTo(2, 10);
  });
});

describe('photoAspect: la foto tiene la forma de la ventana', () => {
  it('ventana de 0,5 × 0,5 en un lienzo 3:4 → foto 3:4', () => {
    expect(photoAspect({ x: 0, y: 0, w: 0.5, h: 0.5 }, 3 / 4)).toBeCloseTo(0.75, 10);
  });

  it('ventana ancha en un lienzo 4:3', () => {
    expect(photoAspect({ x: 0, y: 0, w: 0.6, h: 0.3 }, 4 / 3)).toBeCloseTo((0.6 * 4) / 3 / 0.3, 10);
  });
});

describe('outputSize: la foto conserva su resolución y el lienzo crece a su alrededor', () => {
  it('foto de 1000 px de ancho en una caja de medio lienzo → lienzo de 2000 px', () => {
    expect(outputSize(1000, 750, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })).toEqual({ width: 2000, height: 1500 });
  });

  it('sin ventana (caja = lienzo) el tamaño es el de la foto', () => {
    expect(outputSize(1536, 2048, { x: 0, y: 0, w: 1, h: 1 })).toEqual({ width: 1536, height: 2048 });
  });

  it(`no pasa de ${OUTPUT_MAX_SIDE} px por lado ni de ${OUTPUT_MAX_AREA} px de área (el tope de canvas de iOS)`, () => {
    const s = outputSize(2048, 1536, { x: 0.35, y: 0.35, w: 0.3, h: 0.3 });
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(OUTPUT_MAX_SIDE);
    expect(s.width * s.height).toBeLessThanOrEqual(OUTPUT_MAX_AREA);
    expect(s.width / s.height).toBeCloseTo(2048 / 1536, 2);
  });
});

/** Arma un RGBA de w×h opaco con huecos transparentes en los rectángulos dados (en píxeles). */
function rgba(w: number, h: number, holes: Array<[number, number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x0, y0, hw, hh] of holes) {
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + hw; x++) data[(y * w + x) * 4 + 3] = 0;
  }
  return data;
}

describe('detectWindow: el rectángulo transparente del marco', () => {
  it('encuentra el hueco y lo devuelve normalizado', () => {
    const win = detectWindow(rgba(100, 200, [[20, 40, 50, 100]]), 100, 200);
    expect(win).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 });
  });

  it('con varios huecos se queda con el más grande', () => {
    const win = detectWindow(rgba(100, 100, [[5, 5, 10, 10], [30, 30, 50, 40]]), 100, 100);
    expect(win).toEqual({ x: 0.3, y: 0.3, w: 0.5, h: 0.4 });
  });

  it('una pieza decorativa montada sobre el hueco no lo achica', () => {
    const data = rgba(100, 100, [[20, 20, 60, 60]]);
    for (let y = 20; y < 30; y++) for (let x = 20; x < 30; x++) data[(y * 100 + x) * 4 + 3] = 255;
    expect(detectWindow(data, 100, 100)).toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  });

  it('un PNG transparente de borde a borde no tiene ventana', () => {
    expect(detectWindow(rgba(100, 100, [[0, 0, 100, 100]]), 100, 100)).toBeNull();
    expect(detectWindow(rgba(100, 100, [[10, 0, 80, 60]]), 100, 100)).toBeNull();
  });

  it('un hueco de menos del 5 % no cuenta', () => {
    expect(detectWindow(rgba(100, 100, [[40, 40, 20, 20]]), 100, 100)).toBeNull();
  });

  it('un marco opaco sin hueco no tiene ventana', () => {
    expect(detectWindow(rgba(10, 10, []), 10, 10)).toBeNull();
  });
});

describe('windowAt', () => {
  it('arma la ventana con la escala por defecto', () => {
    expect(windowAt({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.5, scale: DEFAULT_CAPTURE_SCALE });
    expect(DEFAULT_CAPTURE_SCALE).toBe(1.1);
  });
});
