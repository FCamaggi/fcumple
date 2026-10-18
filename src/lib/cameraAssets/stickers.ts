/**
 * Stickers de la cámara (Fase 1): emojis e imágenes que el organizador activa y
 * el invitado coloca sobre la foto antes de disparar.
 *
 * La posición, la escala y la rotación se guardan NORMALIZADAS (0 a 1 respecto
 * al ancho y alto, tamaño relativo al lado menor), de modo que el preview y la
 * foto final coinciden a cualquier resolución.
 */

/** Pila de emoji del dispositivo. Los emojis de Apple no son redistribuibles: en iPhone se ven los de Apple. */
export const EMOJI_FONT_STACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Tamaño de un sticker a escala 1, como fracción del lado menor de la foto. */
export const BASE_STICKER_SIZE = 0.2;
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 3;
/** Máximo de stickers por foto: más que esto la foto queda ilegible. */
export const MAX_STICKERS_PER_PHOTO = 5;

export interface StickerPlacement {
  /** Identificador de esta instancia sobre la foto (un mismo sticker puede repetirse). */
  uid: string;
  assetId: string;
  /** Centro, 0 a 1. */
  x: number;
  y: number;
  scale: number;
  /** Radianes. */
  rotation: number;
}

export type StickerAsset =
  | { kind: 'emoji'; emoji: string }
  | { kind: 'image'; image: CanvasImageSource };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function clampPlacement(p: StickerPlacement): StickerPlacement {
  return {
    ...p,
    x: clamp(p.x, 0, 1),
    y: clamp(p.y, 0, 1),
    scale: clamp(p.scale, MIN_SCALE, MAX_SCALE),
    rotation: ((p.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
  };
}

export function newPlacement(assetId: string, uid: string): StickerPlacement {
  return { uid, assetId, x: 0.5, y: 0.5, scale: 1, rotation: 0 };
}

/** Mueve el sticker en fracciones del ancho/alto de la foto. */
export function moveBy(p: StickerPlacement, dx: number, dy: number): StickerPlacement {
  return clampPlacement({ ...p, x: p.x + dx, y: p.y + dy });
}

export function scaleBy(p: StickerPlacement, factor: number): StickerPlacement {
  return clampPlacement({ ...p, scale: p.scale * factor });
}

export function rotateBy(p: StickerPlacement, radians: number): StickerPlacement {
  return clampPlacement({ ...p, rotation: p.rotation + radians });
}

/**
 * Pellizco con dos dedos: a partir del estado al empezar el gesto, la escala
 * sigue la razón de distancias y la rotación la diferencia de ángulos.
 */
export function applyPinch(
  start: StickerPlacement,
  startDistance: number,
  startAngle: number,
  distance: number,
  angle: number,
): StickerPlacement {
  if (startDistance <= 0) return start;
  return clampPlacement({
    ...start,
    scale: start.scale * (distance / startDistance),
    rotation: start.rotation + (angle - startAngle),
  });
}

/** Tamaño en píxeles de un sticker a la escala dada, para una foto de `width` × `height`. */
export function stickerPixelSize(width: number, height: number, scale: number): number {
  return Math.min(width, height) * BASE_STICKER_SIZE * scale;
}

type Ctx = CanvasRenderingContext2D;

/**
 * Dibuja los stickers sobre el canvas, en orden (el último queda arriba). El
 * marco se dibuja DESPUÉS, para que quede encima de todo.
 */
export function drawStickers(
  ctx: Ctx,
  width: number,
  height: number,
  placements: StickerPlacement[],
  assets: ReadonlyMap<string, StickerAsset>,
): void {
  for (const placement of placements) {
    const asset = assets.get(placement.assetId);
    if (!asset) continue;

    const size = stickerPixelSize(width, height, placement.scale);
    ctx.save();
    ctx.translate(placement.x * width, placement.y * height);
    ctx.rotate(placement.rotation);

    if (asset.kind === 'emoji') {
      ctx.font = `${Math.round(size)}px ${EMOJI_FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(asset.emoji, 0, 0);
    } else {
      // naturalWidth: las <img> sin montar en el DOM no siempre informan `width`.
      const dims = asset.image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
      const iw = dims.naturalWidth || dims.width || 1;
      const ih = dims.naturalHeight || dims.height || 1;
      const ratio = iw / ih;
      // La imagen cabe en un cuadrado de `size` conservando su proporción.
      const w = ratio >= 1 ? size : size * ratio;
      const h = ratio >= 1 ? size / ratio : size;
      ctx.drawImage(asset.image, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
}

/**
 * ¿El texto es exactamente un emoji? (un solo "carácter" visible, incluidas
 * secuencias con tono de piel, banderas y familias). Sirve para validar lo que
 * pega el organizador en el campo de emojis.
 */
export function isSingleEmoji(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 32) return false;
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const graphemes = [...segmenter.segment(value)];
  if (graphemes.length !== 1) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣/u.test(value);
}

// ---------------------------------------------------------------------------
// Imágenes subidas por el organizador
// ---------------------------------------------------------------------------

export const STICKER_MAX_DIMENSION = 512;
export const STICKER_MAX_BYTES = 300 * 1024;
export const STICKER_ACCEPTED_TYPES = ['image/png', 'image/webp', 'image/jpeg'];

/** Tamaño de destino conservando la proporción, sin agrandar. */
export function computeTargetSize(width: number, height: number, max = STICKER_MAX_DIMENSION) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface ImageLimits {
  maxDimension: number;
  maxBytes: number;
}

/** Los stickers son chicos; las imágenes de las capas de un marco pueden cubrir toda la foto. */
export const STICKER_IMAGE_LIMITS: ImageLimits = { maxDimension: STICKER_MAX_DIMENSION, maxBytes: STICKER_MAX_BYTES };
export const FRAME_IMAGE_LIMITS: ImageLimits = { maxDimension: 1600, maxBytes: 1024 * 1024 };

export class StickerImageError extends Error {}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Prepara la imagen del organizador antes de subirla: solo PNG/WebP/JPEG (no
 * SVG), reducida al máximo de `limits` (512 px y ~300 KB para un sticker) y
 * convertida a WebP (conserva transparencia), bajando la calidad hasta que
 * quepa. El re-dibujado en un canvas descarta los metadatos EXIF.
 */
export async function processStickerImage(file: File, limits: ImageLimits = STICKER_IMAGE_LIMITS): Promise<Blob> {
  if (!STICKER_ACCEPTED_TYPES.includes(file.type)) {
    throw new StickerImageError('Usa una imagen PNG, WebP o JPG.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new StickerImageError('No pudimos leer esa imagen.');
  }

  const { width, height } = computeTargetSize(bitmap.width, bitmap.height, limits.maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new StickerImageError('Tu navegador no puede procesar imágenes.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of [0.9, 0.75, 0.6, 0.45]) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (blob && blob.type === 'image/webp' && blob.size <= limits.maxBytes) return blob;
    // Safari antiguo no exporta WebP: cae a PNG, que conserva la transparencia.
    if (blob && blob.type !== 'image/webp') {
      if (blob.size <= limits.maxBytes) return blob;
      break;
    }
  }
  throw new StickerImageError('La imagen es muy pesada. Prueba con una más simple o más chica.');
}
