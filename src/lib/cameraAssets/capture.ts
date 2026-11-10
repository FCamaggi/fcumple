/**
 * Escala del capturador: en un marco de imagen de borde a borde con una ventana transparente, la foto
 * no llena el lienzo bajo el marco. Mide la ventana por la escala, centrada en la ventana, y el lienzo
 * de salida crece a su alrededor para que la foto conserve su resolución.
 *
 * Todas las cajas van normalizadas al lienzo del marco (0..1 en cada eje).
 * Ver docs/fase-1-mvp-multitenant/marcos-y-stickers.md, «Escala del capturador».
 */
import type { FrameLayer } from './layers';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** La ventana de la foto dentro del marco y cuánto la desborda la foto (1 = calza justo). */
export interface CaptureWindow extends Rect {
  scale: number;
}

export const DEFAULT_CAPTURE_SCALE = 1.1;
export const MIN_CAPTURE_SCALE = 1;
export const MAX_CAPTURE_SCALE = 10;
/** Lado mínimo de una ventana válida, en fracción del lienzo. */
export const MIN_WINDOW_SIDE = 0.02;
/** Un hueco más chico que esto (fracción del área) no se toma como ventana. */
export const MIN_WINDOW_AREA = 0.05;

/** Topes del lienzo de salida: Safari en iOS no dibuja canvas de más de ~16,7 M píxeles. */
export const OUTPUT_MAX_SIDE = 4096;
export const OUTPUT_MAX_AREA = 16_000_000;

/** La ventana de la primera imagen de borde a borde que la tenga, o `null` si el marco no tiene ventana. */
export function frameCapture(layers: readonly FrameLayer[] | undefined): CaptureWindow | null {
  for (const layer of layers ?? []) {
    if (layer.type === 'image' && layer.full && layer.capture) return layer.capture;
  }
  return null;
}

/** La escala a partir de la cual la foto ya cubre todo el lienzo; más allá no cambia nada. */
export function maxCaptureScale(win: Rect): number {
  const cx = win.x + win.w / 2;
  const cy = win.y + win.h / 2;
  const s = Math.max(cx / (win.w / 2), (1 - cx) / (win.w / 2), cy / (win.h / 2), (1 - cy) / (win.h / 2));
  return Math.min(MAX_CAPTURE_SCALE, Math.max(MIN_CAPTURE_SCALE, s));
}

export function clampCaptureScale(win: Rect, scale: number): number {
  return Math.min(maxCaptureScale(win), Math.max(MIN_CAPTURE_SCALE, scale));
}

/**
 * Dónde va la foto: la ventana por la escala, centrada en la ventana y recortada al lienzo. Con la ventana
 * cerca de un borde la caja deja de estar centrada de ese lado: lo que quedaría fuera del lienzo no sale en
 * la foto, y así el visor muestra exactamente lo que se graba. La caja siempre cubre la ventana entera, y en
 * la escala máxima es el lienzo entero (como un marco sin ventana).
 */
export function photoBox(cap: CaptureWindow): Rect {
  const scale = clampCaptureScale(cap, cap.scale);
  if (scale >= maxCaptureScale(cap)) return { x: 0, y: 0, w: 1, h: 1 };
  const [x, w] = clipSpan(cap.x, cap.w, cap.w * scale);
  const [y, h] = clipSpan(cap.y, cap.h, cap.h * scale);
  return { x, y, w, h };
}

/** Un tramo de `size` centrado en [start, start + win], recortado a [0, 1] solo si se sale (sin ruido de coma flotante). */
function clipSpan(start: number, win: number, size: number): [number, number] {
  const from = start - (size - win) / 2;
  const to = from + size;
  if (from >= 0 && to <= 1) return [from, size];
  const a = Math.max(0, from);
  return [a, Math.min(1, to) - a];
}

/** Ancho / alto de la foto: el de la caja en un lienzo de proporción `canvasAspect`. */
export function photoAspect(box: Rect, canvasAspect: number): number {
  return (box.w * canvasAspect) / box.h;
}

/**
 * Tamaño del lienzo de salida para que la foto de `photoW`×`photoH` px ocupe `box` sin perder resolución,
 * con los topes de iOS (si se pasan, todo se achica en la misma proporción).
 */
export function outputSize(photoW: number, photoH: number, box: Rect): { width: number; height: number } {
  const width = photoW / box.w;
  const height = photoH / box.h;
  const f = Math.min(1, OUTPUT_MAX_SIDE / Math.max(width, height), Math.sqrt(OUTPUT_MAX_AREA / (width * height)));
  return { width: Math.round(width * f), height: Math.round(height * f) };
}

export function windowAt(rect: Rect, scale = DEFAULT_CAPTURE_SCALE): CaptureWindow {
  return { ...rect, scale };
}

/**
 * Busca la ventana de un marco en sus píxeles RGBA: el hueco transparente (alfa < 128) más grande que no
 * toque el borde de la imagen y ocupe al menos el 5 %. Devuelve su rectángulo envolvente normalizado, así
 * una pieza montada sobre el hueco no lo achica. Un PNG transparente de borde a borde no tiene ventana.
 * Conviene pasarle la imagen achicada (unos 256 px): el resultado es una fracción y no necesita detalle.
 */
export function detectWindow(data: ArrayLike<number>, width: number, height: number): Rect | null {
  const n = width * height;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let best: { area: number; x0: number; y0: number; x1: number; y1: number } | null = null;

  for (let start = 0; start < n; start++) {
    if (seen[start] || data[start * 4 + 3] >= 128) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0;
    let touchesEdge = false;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      area++;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const neighbors = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of neighbors) {
        if (q >= 0 && !seen[q] && data[q * 4 + 3] < 128) {
          seen[q] = 1;
          stack[top++] = q;
        }
      }
    }
    if (!touchesEdge && area >= n * MIN_WINDOW_AREA && (!best || area > best.area)) best = { area, x0, y0, x1, y1 };
  }

  if (!best) return null;
  return {
    x: best.x0 / width,
    y: best.y0 / height,
    w: (best.x1 - best.x0 + 1) / width,
    h: (best.y1 - best.y0 + 1) / height,
  };
}
