/**
 * Marcos paramétricos de la cámara (Fase 1). Un marco = una plantilla + sus
 * parámetros (colores, textos, tipografía, grosor). Se dibuja con Canvas 2D,
 * no es una imagen: la MISMA función pinta la vista previa del organizador, el
 * preview en vivo de la cámara y la foto final, así que nunca se desalinean.
 *
 * Todas las medidas son relativas al lado menor de la imagen (`unit`), por lo
 * que el marco se ve igual a cualquier resolución y orientación.
 *
 * `validateFrameParams` replica `valid_frame_params` de la base de datos
 * (supabase/migrations/20261015100009_camera_assets.sql): mantener ambos
 * sincronizados.
 */

import {
  MAX_LAYERS_PARAMS_LENGTH,
  drawLayers,
  roundedRectPath,
  sanitizeLayers,
  validateLayers,
  type FrameAssets,
  type FrameLayer,
} from './layers';
import { FONT_LABELS, FONT_STACKS, FRAME_FONTS, drawFittedText } from './text';
import type { FrameFont, TextOptions } from './text';

export { FONT_LABELS, FONT_STACKS, FRAME_FONTS, drawFittedText };
export type { FrameFont, TextOptions };

export const FRAME_TEMPLATES = ['capas'] as const;
export type FrameTemplate = (typeof FRAME_TEMPLATES)[number];

export interface FrameParams {
  primaryColor?: string;
  secondaryColor?: string;
  textColor?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  font?: FrameFont;
  /** 0 a 1, relativo al lado menor. */
  thickness?: number;
  /** 0 a 1, relativo al lado menor. */
  radius?: number;
  position?: 'top' | 'bottom';
  /** Solo la plantilla `capas`: ver `layers.ts`. */
  layers?: FrameLayer[];
}

export type FrameField = keyof FrameParams;

export const MAX_TEXT_LENGTH = 60;

export const TEMPLATE_LABELS: Record<FrameTemplate, string> = {
  capas: 'Capas',
};

export const TEMPLATE_DESCRIPTIONS: Record<FrameTemplate, string> = {
  capas: 'Diseño libre: texto, formas, imágenes y emojis apilados en capas.',
};

/** Qué controles muestra el editor para cada plantilla. */
export const TEMPLATE_FIELDS: Record<FrameTemplate, FrameField[]> = {
  capas: ['layers'],
};

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export type ValidationResult = { ok: true } | { ok: false; error: string };

const KNOWN_KEYS = new Set<string>([
  'primaryColor',
  'secondaryColor',
  'textColor',
  'title',
  'subtitle',
  'caption',
  'font',
  'thickness',
  'radius',
  'position',
  'layers',
]);

/** Misma regla que `valid_frame_params` en la base de datos. */
export function validateFrameParams(params: unknown): ValidationResult {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return { ok: false, error: 'Los parámetros del marco no son válidos.' };
  }
  const p = params as Record<string, unknown>;

  // Con capas el tope sube (ver `MAX_LAYERS_PARAMS_LENGTH`); el resto de las plantillas conserva 2 KB.
  const maxLength = 'layers' in p ? MAX_LAYERS_PARAMS_LENGTH : 2048;
  if (JSON.stringify(p).length > maxLength) return { ok: false, error: 'El marco tiene demasiados datos.' };

  for (const key of Object.keys(p)) {
    if (!KNOWN_KEYS.has(key)) return { ok: false, error: `Campo desconocido: ${key}.` };
  }

  for (const key of ['primaryColor', 'secondaryColor', 'textColor'] as const) {
    if (key in p && !(typeof p[key] === 'string' && COLOR_PATTERN.test(p[key] as string))) {
      return { ok: false, error: 'Los colores deben ser como #RRGGBB.' };
    }
  }
  for (const key of ['title', 'subtitle', 'caption'] as const) {
    if (key in p && !(typeof p[key] === 'string' && (p[key] as string).length <= MAX_TEXT_LENGTH)) {
      return { ok: false, error: `Los textos pueden tener hasta ${MAX_TEXT_LENGTH} caracteres.` };
    }
  }
  if ('font' in p && !FRAME_FONTS.includes(p.font as FrameFont)) {
    return { ok: false, error: 'Tipografía no disponible.' };
  }
  for (const key of ['thickness', 'radius'] as const) {
    if (key in p && !(typeof p[key] === 'number' && (p[key] as number) >= 0 && (p[key] as number) <= 1)) {
      return { ok: false, error: 'El grosor y el radio van entre 0 y 1.' };
    }
  }
  if ('position' in p && p.position !== 'top' && p.position !== 'bottom') {
    return { ok: false, error: 'La posición debe ser arriba o abajo.' };
  }
  if ('layers' in p) return validateLayers(p.layers);
  return { ok: true };
}

/**
 * Defensa para el render: descarta todo lo que no valide (claves ajenas,
 * colores raros, textos largos) en vez de dibujarlo. Los datos ya se validan
 * en la base; esto cubre filas viejas o corruptas.
 */
export function sanitizeFrameParams(raw: unknown): FrameParams {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN_KEYS.has(key)) continue;
    if (key === 'layers') {
      if (Array.isArray(value)) out.layers = sanitizeLayers(value);
    } else if (validateFrameParams({ [key]: value }).ok) {
      out[key] = value;
    }
  }
  return out as FrameParams;
}

export interface FrameDefaultsContext {
  eventName?: string;
  /** Ya formateada, p. ej. "05/12/2026". */
  eventDate?: string;
}

/** Parámetros iniciales al crear un marco, prellenados con el evento. */
export function defaultFrameParams(template: FrameTemplate, ctx: FrameDefaultsContext = {}): FrameParams {
  const name = (ctx.eventName ?? '').trim().slice(0, MAX_TEXT_LENGTH);

  switch (template) {
    case 'capas':
      return {
        layers: name
          ? [{ type: 'text', text: name, x: 0.5, y: 0.92, size: 0.08, w: 1.6, font: 'display', color: '#ffffff', weight: 'bold' }]
          : [],
      };
  }
}

// ---------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

function drawCapas(ctx: Ctx, w: number, h: number, unit: number, p: FrameParams, assets?: FrameAssets): void {
  drawLayers(ctx, w, h, unit, p.layers ?? [], assets);
}

const DRAWERS: Record<
  FrameTemplate,
  (ctx: Ctx, w: number, h: number, unit: number, p: FrameParams, assets?: FrameAssets) => void
> = {
  capas: drawCapas,
};

/**
 * Dibuja el marco sobre el canvas (que ya tiene la foto o el video debajo). No
 * limpia el canvas: solo agrega el marco. Si la plantilla es desconocida no
 * dibuja nada. `assets` trae las imágenes ya cargadas de la plantilla `capas`
 * (ver `prepareFrameAssets`).
 */
export function renderFrame(
  ctx: Ctx,
  width: number,
  height: number,
  template: string,
  rawParams: unknown,
  assets?: FrameAssets,
): void {
  const draw = DRAWERS[template as FrameTemplate];
  if (!draw || width <= 0 || height <= 0) return;
  ctx.save();
  draw(ctx, width, height, Math.min(width, height), sanitizeFrameParams(rawParams), assets);
  ctx.restore();
}
