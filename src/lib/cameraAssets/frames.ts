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

export const FRAME_TEMPLATES = ['border', 'polaroid', 'film', 'viewfinder', 'banner', 'glow', 'capas'] as const;
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
  border: 'Borde',
  polaroid: 'Polaroid',
  film: 'Rollo',
  viewfinder: 'Visor',
  banner: 'Banner',
  glow: 'Destello',
  capas: 'Capas',
};

export const TEMPLATE_DESCRIPTIONS: Record<FrameTemplate, string> = {
  border: 'Un borde de color con esquinas redondeadas.',
  polaroid: 'Marco blanco ancho con una leyenda abajo.',
  film: 'Franja de rollo de cine con perforaciones y un texto corto.',
  viewfinder: 'Esquinas de visor y marca REC con un texto abajo.',
  banner: 'Banda con título y subtítulo, arriba o abajo.',
  glow: 'Degradé de color en los bordes.',
  capas: 'Diseño libre: texto, formas, imágenes y emojis apilados en capas.',
};

/** Qué controles muestra el editor para cada plantilla. */
export const TEMPLATE_FIELDS: Record<FrameTemplate, FrameField[]> = {
  border: ['primaryColor', 'thickness', 'radius'],
  polaroid: ['primaryColor', 'textColor', 'caption', 'font', 'thickness'],
  film: ['primaryColor', 'textColor', 'title', 'font'],
  viewfinder: ['primaryColor', 'textColor', 'title', 'font', 'thickness'],
  banner: ['primaryColor', 'textColor', 'title', 'subtitle', 'font', 'position'],
  glow: ['primaryColor', 'secondaryColor', 'thickness'],
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

/** Parámetros iniciales al crear un marco de cada plantilla, prellenados con el evento. */
export function defaultFrameParams(template: FrameTemplate, ctx: FrameDefaultsContext = {}): FrameParams {
  const name = (ctx.eventName ?? '').trim().slice(0, MAX_TEXT_LENGTH);
  const date = (ctx.eventDate ?? '').trim().slice(0, MAX_TEXT_LENGTH);
  const withText = (key: 'title' | 'caption', value: string): Partial<FrameParams> => (value ? { [key]: value } : {});

  switch (template) {
    case 'border':
      return { primaryColor: '#ff4fa3', thickness: 0.04, radius: 0.05 };
    case 'polaroid':
      return { primaryColor: '#ffffff', textColor: '#222222', font: 'hand', thickness: 0.05, ...withText('caption', name) };
    case 'film':
      return { primaryColor: '#111111', textColor: '#f5d36b', font: 'typewriter', ...withText('title', date || name) };
    case 'viewfinder':
      return { primaryColor: '#ffffff', textColor: '#ffffff', font: 'mono', thickness: 0.008, ...withText('title', date) };
    case 'banner':
      return {
        primaryColor: '#111111',
        textColor: '#ffffff',
        font: 'display',
        position: 'bottom',
        ...withText('title', name),
        ...(date ? { subtitle: date } : {}),
      };
    case 'glow':
      return { primaryColor: '#ff4fa3', secondaryColor: '#4fc3ff', thickness: 0.18 };
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

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function drawBorder(ctx: Ctx, w: number, h: number, unit: number, p: FrameParams): void {
  const t = (p.thickness ?? 0.04) * unit;
  const r = (p.radius ?? 0.05) * unit;
  ctx.fillStyle = p.primaryColor ?? '#ff4fa3';
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  roundedRectPath(ctx, t, t, w - 2 * t, h - 2 * t, r);
  ctx.fill('evenodd');
}

function drawPolaroid(ctx: Ctx, w: number, h: number, unit: number, p: FrameParams): void {
  const side = (p.thickness ?? 0.05) * unit;
  const bottom = Math.max(side * 3.2, unit * 0.16);
  ctx.fillStyle = p.primaryColor ?? '#ffffff';
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(side, side, w - 2 * side, h - side - bottom);
  ctx.fill('evenodd');

  if (p.caption) {
    drawFittedText(ctx, p.caption, w / 2, h - bottom / 2, w - 2 * side, bottom * 0.5, {
      font: p.font ?? 'hand',
      color: p.textColor ?? '#222222',
    });
  }
}

function drawFilm(ctx: Ctx, w: number, h: number, unit: number, p: FrameParams): void {
  const band = unit * 0.1;
  const color = p.primaryColor ?? '#111111';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, band);
  ctx.fillRect(0, h - band, w, band);

  // Perforaciones: cuadrados redondeados claros a lo largo de cada franja.
  const hole = band * 0.42;
  const step = hole * 2.1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  for (let x = step / 2; x < w - hole; x += step) {
    roundedRectPath(ctx, x, (band - hole) / 2, hole, hole, hole * 0.25);
    roundedRectPath(ctx, x, h - band + (band - hole) / 2, hole, hole, hole * 0.25);
  }
  ctx.fill();

  if (p.title) {
    // El texto va sobre una pastilla del color de la franja, en el centro inferior.
    drawFittedText(ctx, p.title, w / 2, h - band * 1.9, w * 0.8, band * 0.8, {
      font: p.font ?? 'typewriter',
      color: p.textColor ?? '#f5d36b',
      weight: 'bold',
    });
  }
}

function drawViewfinder(ctx: Ctx, w: number, h: number, unit: number, p: FrameParams): void {
  const color = p.primaryColor ?? '#ffffff';
  const inset = unit * 0.05;
  const len = unit * 0.12;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, (p.thickness ?? 0.008) * unit);
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [
    [inset, inset, 1, 1],
    [w - inset, inset, -1, 1],
    [inset, h - inset, 1, -1],
    [w - inset, h - inset, -1, -1],
  ] as const) {
    ctx.moveTo(cx + dx * len, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * len);
  }
  ctx.stroke();

  // Marca REC arriba a la izquierda.
  const dot = unit * 0.014;
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(inset + dot * 1.5, inset + len * 0.55, dot, 0, Math.PI * 2);
  ctx.fill();
  drawFittedText(ctx, 'REC', inset + dot * 4.2, inset + len * 0.55, unit * 0.12, unit * 0.032, {
    font: 'mono',
    color: p.textColor ?? '#ffffff',
    weight: 'bold',
    align: 'left',
  });

  if (p.title) {
    drawFittedText(ctx, p.title, w - inset * 1.2, h - inset - len * 0.55, w * 0.6, unit * 0.04, {
      font: p.font ?? 'mono',
      color: p.textColor ?? '#ffffff',
      weight: 'bold',
      align: 'right',
    });
  }
}

function drawBanner(ctx: Ctx, w: number, h: number, unit: number, p: FrameParams): void {
  const hasSub = Boolean(p.subtitle);
  const bandH = unit * (hasSub ? 0.18 : 0.13);
  const top = p.position === 'top';
  const y0 = top ? 0 : h - bandH;
  ctx.fillStyle = p.primaryColor ?? '#111111';
  ctx.fillRect(0, y0, w, bandH);

  const font = p.font ?? 'display';
  const color = p.textColor ?? '#ffffff';
  if (p.title) {
    const cy = y0 + bandH * (hasSub ? 0.36 : 0.5);
    drawFittedText(ctx, p.title, w / 2, cy, w * 0.9, bandH * (hasSub ? 0.4 : 0.52), { font, color, weight: 'bold' });
  }
  if (p.subtitle) {
    drawFittedText(ctx, p.subtitle, w / 2, y0 + bandH * 0.74, w * 0.9, bandH * 0.24, { font, color });
  }
}

function drawGlow(ctx: Ctx, w: number, h: number, unit: number, p: FrameParams): void {
  const size = (p.thickness ?? 0.18) * unit;
  const a = p.primaryColor ?? '#ff4fa3';
  const b = p.secondaryColor ?? a;

  const edge = (x0: number, y0: number, x1: number, y1: number, color: string, rx: number, ry: number, rw: number, rh: number) => {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, hexToRgba(color, 0.75));
    gradient.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(rx, ry, rw, rh);
  };

  edge(0, 0, 0, size, a, 0, 0, w, size); // arriba
  edge(0, 0, size, 0, a, 0, 0, size, h); // izquierda
  edge(0, h, 0, h - size, b, 0, h - size, w, size); // abajo
  edge(w, 0, w - size, 0, b, w - size, 0, size, h); // derecha
}

function drawCapas(ctx: Ctx, w: number, h: number, unit: number, p: FrameParams, assets?: FrameAssets): void {
  drawLayers(ctx, w, h, unit, p.layers ?? [], assets);
}

const DRAWERS: Record<
  FrameTemplate,
  (ctx: Ctx, w: number, h: number, unit: number, p: FrameParams, assets?: FrameAssets) => void
> = {
  border: drawBorder,
  polaroid: drawPolaroid,
  film: drawFilm,
  viewfinder: drawViewfinder,
  banner: drawBanner,
  glow: drawGlow,
  capas: drawCapas,
};

/**
 * Dibuja el marco sobre el canvas (que ya tiene la foto o el video debajo). No
 * limpia el canvas: solo agrega el marco. Si la plantilla es desconocida no
 * dibuja nada. `assets` trae las imágenes ya cargadas de la plantilla `capas`
 * (ver `prepareFrameAssets`); el resto de las plantillas no las usa.
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
