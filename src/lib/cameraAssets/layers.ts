/**
 * Capas de la plantilla `capas`: un marco es una lista de capas apiladas
 * (texto, formas, imágenes y emojis) que `renderFrame` dibuja de abajo hacia
 * arriba. Es lo que permite armar marcos libres, tipo Canva, sin una plantilla
 * fija por cada diseño.
 *
 * Medidas: la posición (`x`, `y`) es una fracción del ancho y del alto del
 * lienzo; todo lo demás (tamaños, bordes, sombras) es relativo al lado menor,
 * igual que el resto de los marcos, así el diseño se ve igual a cualquier
 * resolución. La rotación va en grados y el ancla dice qué punto de la capa cae
 * sobre (`x`, `y`).
 *
 * `validateLayers` es la fuente de la regla; cuando haya migración, la función
 * `valid_frame_params` de la base debe replicarla (como hace con el resto).
 */

import type { ValidationResult } from './frames';
import { FRAME_FONTS, drawFittedText, type FrameFont } from './text';

type Ctx = CanvasRenderingContext2D;

export const MAX_LAYERS = 40;
export const MAX_LAYER_TEXT_LENGTH = 60;
export const MAX_PATH_LENGTH = 600;
/** Tope, en caracteres del JSON, de `params` cuando trae capas (el resto conserva 2048). La base lo mide en bytes: ver migración. */
export const MAX_LAYERS_PARAMS_LENGTH = 16384;

export const LAYER_ANCHORS = ['center', 'tl', 'tr', 'bl', 'br'] as const;
export type LayerAnchor = (typeof LAYER_ANCHORS)[number];

export const SHAPE_KINDS = ['rect', 'ellipse', 'line', 'path'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface LayerShadow {
  color: string;
  blur: number;
  x: number;
  y: number;
}

interface LayerBase {
  /** Fracción del ancho del lienzo donde cae el ancla (0 a 1; admite un poco fuera). */
  x?: number;
  /** Fracción del alto del lienzo. */
  y?: number;
  /** Grados, en sentido horario. */
  rotation?: number;
  opacity?: number;
  anchor?: LayerAnchor;
  shadow?: LayerShadow;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  /** Alto del texto, relativo al lado menor. */
  size?: number;
  font?: FrameFont;
  color?: string;
  weight?: 'normal' | 'bold';
  /** Ancho máximo, relativo al lado menor: el texto se achica o se trunca para caber. */
  w?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: ShapeKind;
  w?: number;
  h?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Solo `rect`: esquinas redondeadas, relativo al lado menor. */
  radius?: number;
  /** Solo `path`: trazo en una caja de 100 × 100 que se escala a `w` × `h`. */
  d?: string;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  /** Ruta en Storage dentro de la carpeta de marcos del evento: `{event_id}/frames/archivo`. */
  src: string;
  w?: number;
  h?: number;
  /** Cubre todo el lienzo y se ignoran posición, tamaño y rotación (marcos hechos en Canva). */
  full?: boolean;
}

export interface EmojiLayer extends LayerBase {
  type: 'emoji';
  emoji: string;
  size?: number;
}

export type FrameLayer = TextLayer | ShapeLayer | ImageLayer | EmojiLayer;

export interface FrameAssets {
  /** Imágenes ya cargadas, por la ruta `src` de la capa. */
  images: ReadonlyMap<string, CanvasImageSource>;
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const PATH_PATTERN = /^[MLCZ0-9.,\s-]+$/;
const IMAGE_SRC_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/frames\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;

const COMMON_KEYS = ['type', 'x', 'y', 'rotation', 'opacity', 'anchor', 'shadow'];
const KEYS_BY_TYPE: Record<FrameLayer['type'], Set<string>> = {
  text: new Set([...COMMON_KEYS, 'text', 'size', 'font', 'color', 'weight', 'w', 'strokeColor', 'strokeWidth']),
  shape: new Set([...COMMON_KEYS, 'shape', 'w', 'h', 'fill', 'stroke', 'strokeWidth', 'radius', 'd']),
  image: new Set([...COMMON_KEYS, 'src', 'w', 'h', 'full']),
  emoji: new Set([...COMMON_KEYS, 'emoji', 'size']),
};

const fail = (error: string): ValidationResult => ({ ok: false, error });

const isNumberIn = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isColor = (value: unknown): boolean => typeof value === 'string' && COLOR_PATTERN.test(value);

function validateShadow(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('La sombra no es válida.');
  const s = raw as Record<string, unknown>;
  if (Object.keys(s).some((k) => !['color', 'blur', 'x', 'y'].includes(k))) return fail('La sombra no es válida.');
  if (!isColor(s.color) || !isNumberIn(s.blur, 0, 0.2) || !isNumberIn(s.x, -0.2, 0.2) || !isNumberIn(s.y, -0.2, 0.2)) {
    return fail('La sombra no es válida.');
  }
  return { ok: true };
}

function validateLayer(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('Una capa no es válida.');
  const l = raw as Record<string, unknown>;
  // `hasOwn`: sin él, un `type` como "constructor" o "toString" pasaría por las propiedades heredadas del objeto.
  if (typeof l.type !== 'string' || !Object.hasOwn(KEYS_BY_TYPE, l.type)) return fail('Tipo de capa desconocido.');
  const type = l.type as FrameLayer['type'];
  const allowed = KEYS_BY_TYPE[type];
  for (const key of Object.keys(l)) {
    if (!allowed.has(key)) return fail(`Campo desconocido en la capa: ${key}.`);
  }

  if ('x' in l && !isNumberIn(l.x, -1, 2)) return fail('La posición de la capa está fuera de rango.');
  if ('y' in l && !isNumberIn(l.y, -1, 2)) return fail('La posición de la capa está fuera de rango.');
  if ('rotation' in l && !isNumberIn(l.rotation, -360, 360)) return fail('La rotación va entre -360 y 360 grados.');
  if ('opacity' in l && !isNumberIn(l.opacity, 0, 1)) return fail('La opacidad va entre 0 y 1.');
  if ('anchor' in l && !LAYER_ANCHORS.includes(l.anchor as LayerAnchor)) return fail('Ancla desconocida.');
  if ('shadow' in l) {
    const shadow = validateShadow(l.shadow);
    if (!shadow.ok) return shadow;
  }

  switch (type) {
    case 'text': {
      if (typeof l.text !== 'string' || l.text.trim().length < 1 || l.text.length > MAX_LAYER_TEXT_LENGTH) {
        return fail(`Los textos pueden tener hasta ${MAX_LAYER_TEXT_LENGTH} caracteres.`);
      }
      if ('size' in l && !isNumberIn(l.size, 0.005, 1)) return fail('El tamaño del texto está fuera de rango.');
      if ('font' in l && !FRAME_FONTS.includes(l.font as FrameFont)) return fail('Tipografía no disponible.');
      if ('color' in l && !isColor(l.color)) return fail('Los colores deben ser como #RRGGBB.');
      if ('weight' in l && l.weight !== 'normal' && l.weight !== 'bold') return fail('El grosor de letra no es válido.');
      if ('w' in l && !isNumberIn(l.w, 0.05, 4)) return fail('El ancho del texto está fuera de rango.');
      if ('strokeColor' in l && !isColor(l.strokeColor)) return fail('Los colores deben ser como #RRGGBB.');
      if ('strokeWidth' in l && !isNumberIn(l.strokeWidth, 0, 0.2)) return fail('El borde está fuera de rango.');
      return { ok: true };
    }
    case 'shape': {
      if (!SHAPE_KINDS.includes(l.shape as ShapeKind)) return fail('Forma desconocida.');
      for (const key of ['w', 'h'] as const) {
        if (key in l && !isNumberIn(l[key], 0, 4)) return fail('El tamaño de la forma está fuera de rango.');
      }
      for (const key of ['fill', 'stroke'] as const) {
        if (key in l && !isColor(l[key])) return fail('Los colores deben ser como #RRGGBB.');
      }
      if ('strokeWidth' in l && !isNumberIn(l.strokeWidth, 0, 0.2)) return fail('El borde está fuera de rango.');
      if ('radius' in l && !isNumberIn(l.radius, 0, 1)) return fail('El radio va entre 0 y 1.');
      if (l.shape === 'path') {
        if (typeof l.d !== 'string' || l.d.length === 0 || l.d.length > MAX_PATH_LENGTH || !PATH_PATTERN.test(l.d)) {
          return fail('El trazo no es válido.');
        }
      } else if ('d' in l) {
        return fail('Solo el trazo lleva datos de recorrido.');
      }
      return { ok: true };
    }
    case 'image': {
      if (typeof l.src !== 'string' || !IMAGE_SRC_PATTERN.test(l.src)) return fail('La imagen no es válida.');
      if ('full' in l && typeof l.full !== 'boolean') return fail('La imagen no es válida.');
      for (const key of ['w', 'h'] as const) {
        if (key in l && !isNumberIn(l[key], 0, 4)) return fail('El tamaño de la imagen está fuera de rango.');
      }
      if (l.full !== true && !(typeof l.w === 'number' && typeof l.h === 'number')) {
        return fail('La imagen necesita tamaño o cubrir todo el lienzo.');
      }
      return { ok: true };
    }
    case 'emoji': {
      if (typeof l.emoji !== 'string' || l.emoji.length < 1 || l.emoji.length > 32) return fail('El emoji no es válido.');
      if ('size' in l && !isNumberIn(l.size, 0.01, 1)) return fail('El tamaño del emoji está fuera de rango.');
      return { ok: true };
    }
  }
}

/** Valida la lista completa de capas (tope de cantidad incluido). */
export function validateLayers(layers: unknown): ValidationResult {
  if (!Array.isArray(layers)) return fail('Las capas deben ser una lista.');
  if (layers.length > MAX_LAYERS) return fail(`Un marco puede tener hasta ${MAX_LAYERS} capas.`);
  for (const layer of layers) {
    const result = validateLayer(layer);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/** Para el render: conserva las capas válidas (hasta el tope) y descarta el resto en vez de fallar. */
export function sanitizeLayers(raw: unknown): FrameLayer[] {
  if (!Array.isArray(raw)) return [];
  const out: FrameLayer[] = [];
  for (const layer of raw) {
    if (out.length >= MAX_LAYERS) break;
    if (validateLayer(layer).ok) out.push(layer as FrameLayer);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------------

/** Rutas de las imágenes que usan las capas, sin repetir y en orden de aparición. */
export function collectImagePaths(layers: readonly FrameLayer[]): string[] {
  const paths: string[] = [];
  for (const layer of layers) {
    if (layer.type === 'image' && !paths.includes(layer.src)) paths.push(layer.src);
  }
  return paths;
}

function loadImage(url: string): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Sin esto el canvas queda "contaminado" y no se puede exportar la foto.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen ${url}`));
    img.src = url;
  });
}

/**
 * Descarga las imágenes de las capas antes de dibujar (`renderFrame` es
 * síncrona). `resolveUrl` convierte la ruta de Storage en una URL; una imagen
 * que falla se deja fuera y el resto del marco se dibuja igual.
 */
export async function prepareFrameAssets(
  layers: readonly FrameLayer[],
  resolveUrl: (path: string) => string,
  load: (url: string) => Promise<CanvasImageSource> = loadImage,
): Promise<FrameAssets> {
  const paths = collectImagePaths(layers);
  const results = await Promise.allSettled(paths.map((path) => load(resolveUrl(path))));
  const images = new Map<string, CanvasImageSource>();
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') images.set(paths[i], result.value);
  });
  return { images };
}

// ---------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------

/** Rectángulo redondeado a mano: `ctx.roundRect` no existe en Safari antiguo ni en jsdom. */
export function roundedRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

const EMOJI_STACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Esquina superior izquierda de la caja respecto del punto de anclaje. */
function anchorOffset(anchor: LayerAnchor, bw: number, bh: number): [number, number] {
  switch (anchor) {
    case 'tl':
      return [0, 0];
    case 'tr':
      return [-bw, 0];
    case 'bl':
      return [0, -bh];
    case 'br':
      return [-bw, -bh];
    default:
      return [-bw / 2, -bh / 2];
  }
}

function paintShape(ctx: Ctx, layer: ShapeLayer, unit: number, ox: number, oy: number, bw: number, bh: number): void {
  const strokeWidth = (layer.strokeWidth ?? 0.01) * unit;
  // Sin relleno ni borde la forma sería invisible: se dibuja rellena en rosa.
  const fill = layer.fill ?? (layer.stroke || layer.shape === 'line' ? undefined : '#ff4fa3');
  const stroke = layer.stroke ?? (layer.shape === 'line' ? '#ffffff' : undefined);

  const paint = (path?: Path2D, lineWidth = strokeWidth) => {
    if (fill) {
      ctx.fillStyle = fill;
      if (path) ctx.fill(path);
      else ctx.fill();
    }
    if (stroke && lineWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (path) ctx.stroke(path);
      else ctx.stroke();
    }
  };

  switch (layer.shape) {
    case 'rect':
      ctx.beginPath();
      roundedRectPath(ctx, ox, oy, bw, bh, (layer.radius ?? 0) * unit);
      paint();
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(ox + bw / 2, oy + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
      paint();
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + bw, oy);
      paint();
      break;
    case 'path': {
      if (typeof Path2D === 'undefined' || !layer.d) break;
      const sx = bw / 100;
      const sy = bh / 100;
      ctx.translate(ox, oy);
      ctx.scale(sx, sy);
      // El grosor del borde se compensa con la escala media para que no se deforme demasiado.
      paint(new Path2D(layer.d), strokeWidth / (((sx + sy) / 2) || 1));
      break;
    }
  }
}

function drawLayer(ctx: Ctx, w: number, h: number, unit: number, layer: FrameLayer, assets?: FrameAssets): void {
  ctx.globalAlpha = layer.opacity ?? 1;

  if (layer.type === 'image' && layer.full) {
    const img = assets?.images.get(layer.src);
    if (img) ctx.drawImage(img, 0, 0, w, h);
    return;
  }

  if (layer.shadow) {
    ctx.shadowColor = layer.shadow.color;
    ctx.shadowBlur = layer.shadow.blur * unit;
    ctx.shadowOffsetX = layer.shadow.x * unit;
    ctx.shadowOffsetY = layer.shadow.y * unit;
  }

  ctx.translate((layer.x ?? 0.5) * w, (layer.y ?? 0.5) * h);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);

  let bw: number;
  let bh: number;
  switch (layer.type) {
    case 'text':
      bw = (layer.w ?? 2) * unit;
      bh = (layer.size ?? 0.06) * unit;
      break;
    case 'emoji':
      bw = bh = (layer.size ?? 0.1) * unit;
      break;
    case 'shape':
      bw = (layer.w ?? 0.2) * unit;
      bh = layer.shape === 'line' ? 0 : (layer.h ?? 0.2) * unit;
      break;
    case 'image':
      bw = (layer.w ?? 0) * unit;
      bh = (layer.h ?? 0) * unit;
      break;
  }
  const [ox, oy] = anchorOffset(layer.anchor ?? 'center', bw, bh);

  switch (layer.type) {
    case 'text':
      drawFittedText(ctx, layer.text, ox + bw / 2, oy + bh / 2, bw, bh, {
        font: layer.font ?? 'sans',
        color: layer.color ?? '#ffffff',
        weight: layer.weight,
        strokeColor: layer.strokeColor,
        strokeWidth: layer.strokeWidth ? layer.strokeWidth * unit : undefined,
      });
      break;
    case 'emoji':
      ctx.font = `${Math.round(bh)}px ${EMOJI_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(layer.emoji, ox + bw / 2, oy + bh / 2);
      break;
    case 'shape':
      paintShape(ctx, layer, unit, ox, oy, bw, bh);
      break;
    case 'image': {
      const img = assets?.images.get(layer.src);
      if (img && bw > 0 && bh > 0) ctx.drawImage(img, ox, oy, bw, bh);
      break;
    }
  }
}

/**
 * Dibuja las capas en orden (la primera queda al fondo). Cada capa va en su
 * propio save/restore, así una no contamina a la siguiente. Recibe las capas ya
 * saneadas y las imágenes ya cargadas; una imagen que falta se omite.
 */
export function drawLayers(
  ctx: Ctx,
  w: number,
  h: number,
  unit: number,
  layers: readonly FrameLayer[],
  assets?: FrameAssets,
): void {
  for (const layer of layers) {
    ctx.save();
    drawLayer(ctx, w, h, unit, layer, assets);
    ctx.restore();
  }
}
