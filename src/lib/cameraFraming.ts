/**
 * Encuadre de la cámara del invitado. El visor y la foto final tienen SIEMPRE la misma proporción, la del
 * teléfono (3:4 en vertical, 4:3 en horizontal), sin importar qué video entregue el navegador: algunos
 * teléfonos dan 9:16, otros 4:3 apaisado aun estando en vertical. El video se recorta al centro para
 * llenar ese encuadre, igual en el visor (`object-cover`) y al disparar (`coverCrop`).
 */

export type FramingOrientation = 'portrait' | 'landscape';

export const PORTRAIT_ASPECT = 3 / 4;
export const LANDSCAPE_ASPECT = 4 / 3;

/** ancho / alto de la foto según cómo sostiene el teléfono el invitado. */
export function aspectForOrientation(orientation: FramingOrientation): number {
  return orientation === 'portrait' ? PORTRAIT_ASPECT : LANDSCAPE_ASPECT;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Mayor rectángulo centrado de `srcW`×`srcH` con proporción `aspect` (ancho / alto): lo que muestra
 * `object-fit: cover` en una caja de esa proporción. Si el origen ya la tiene, devuelve todo el cuadro.
 */
export function coverCrop(srcW: number, srcH: number, aspect: number): CropRect {
  if (!(srcW > 0) || !(srcH > 0) || !(aspect > 0) || !Number.isFinite(aspect)) {
    return { sx: 0, sy: 0, sw: Math.max(0, srcW), sh: Math.max(0, srcH) };
  }
  const srcAspect = srcW / srcH;
  if (srcAspect > aspect) {
    // Más ancho que el encuadre: se recortan los costados.
    const sw = srcH * aspect;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  // Más alto (o igual): se recortan arriba y abajo.
  const sh = srcW / aspect;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}
