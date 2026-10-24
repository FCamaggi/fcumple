import type { RawRevealedPhoto } from '../components/RevealedRoll';
import { THEME_PRESETS } from './theme';

// Fotos de ejemplo de la vista previa de la organizadora: dibujos SVG en `data:`, con los colores del preset base.
// No son fotos de nadie y no pasan por el almacenamiento: `photosApi` devuelve tal cual estas rutas exactas (y
// ninguna otra `data:`), así que una fila manipulada de `photos` no puede servirse como imagen por esa vía.
const BASE = THEME_PRESETS[0].colors;

function samplePhoto(index: number): RawRevealedPhoto {
  const n = index + 1;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BASE.surface}"/>` +
    `<stop offset="1" stop-color="${BASE.border}"/></linearGradient></defs>` +
    `<rect width="400" height="500" fill="url(#g)"/>` +
    `<circle cx="${120 + index * 30}" cy="${170 + (index % 3) * 40}" r="70" fill="none" stroke="${BASE.text}" stroke-opacity="0.35" stroke-width="3"/>` +
    `<text x="200" y="440" text-anchor="middle" font-family="monospace" font-size="22" fill="${BASE.text}" fill-opacity="0.7">FOTO DE EJEMPLO ${n}</text>` +
    `</svg>`;
  return {
    storagePath: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    displayStoragePath: null,
    // Dos horas de la misma noche, para que el rollo muestre más de una banda horaria.
    createdAt: `2026-10-30T${String(22 + Math.floor(index / 3)).padStart(2, '0')}:${String((index % 3) * 15).padStart(2, '0')}:00Z`,
  };
}

export const SAMPLE_PHOTOS: RawRevealedPhoto[] = Array.from({ length: 6 }, (_, i) => samplePhoto(i));

const SAMPLE_PATHS = new Set(SAMPLE_PHOTOS.map((p) => p.storagePath));

export function isSamplePhotoPath(path: string): boolean {
  return SAMPLE_PATHS.has(path);
}
