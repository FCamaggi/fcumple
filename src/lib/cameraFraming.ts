/**
 * Encuadre de la cámara del invitado. El visor y la foto final tienen SIEMPRE la misma proporción,
 * la que elige el invitado entre las permitidas (por defecto 3:4 en vertical, 4:3 en horizontal),
 * sin importar qué video entregue el navegador: algunos teléfonos dan 9:16, otros 4:3 apaisado
 * aun estando en vertical. El video se recorta al centro para llenar ese encuadre, igual en el
 * visor (`object-cover`) y al disparar (`coverCrop`).
 */

import type { VariantRatio } from './cameraAssets/frames';

export type FramingOrientation = 'portrait' | 'landscape';

export const PORTRAIT_ASPECT = 3 / 4;
export const LANDSCAPE_ASPECT = 4 / 3;

/** ancho / alto de la foto según cómo sostiene el teléfono el invitado. */
export function aspectForOrientation(orientation: FramingOrientation): number {
  return orientation === 'portrait' ? PORTRAIT_ASPECT : LANDSCAPE_ASPECT;
}

const PORTRAIT_RATIOS: readonly VariantRatio[] = ['3:4', '1:1', '9:16'];
const LANDSCAPE_RATIOS: readonly VariantRatio[] = ['4:3', '1:1'];

/** Proporciones disponibles para la foto según la orientación del teléfono. */
export function ratiosForOrientation(orientation: FramingOrientation): readonly VariantRatio[] {
  return orientation === 'portrait' ? PORTRAIT_RATIOS : LANDSCAPE_RATIOS;
}

/** Proporción por defecto al abrir la cámara o girar el teléfono. */
export function defaultRatio(orientation: FramingOrientation): VariantRatio {
  return orientation === 'portrait' ? '3:4' : '4:3';
}

const RATIO_ASPECTS: Record<VariantRatio, number> = {
  '3:4': 3 / 4,
  '4:3': 4 / 3,
  '1:1': 1,
  '9:16': 9 / 16,
};

/** Proporción numérica (ancho / alto) de una proporción fotográfica. */
export function ratioAspect(ratio: VariantRatio): number {
  return RATIO_ASPECTS[ratio];
}

/**
 * Resuelve la proporción activa: conserva la elegida por el invitado si la orientación
 * actual la permite; si no (o si aún no eligió ninguna), vuelve a la por defecto.
 */
export function resolveRatio(orientation: FramingOrientation, chosen?: VariantRatio): VariantRatio {
  const allowed = ratiosForOrientation(orientation);
  if (chosen && allowed.includes(chosen)) return chosen;
  return defaultRatio(orientation);
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
