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
import { getCachedPackAssetImage, resolvePackAssetUrl, setCachedPackAssetImage } from './packs';
import { LAYER_FONTS, drawFittedText, loadLayerFonts, type LayerFont } from './text';

type Ctx = CanvasRenderingContext2D;

export const MAX_LAYERS = 40;
export const MAX_LAYER_TEXT_LENGTH = 60;
export const MAX_PATH_LENGTH = 600;
/** Tope, en caracteres del JSON, de `params` cuando trae capas (el resto conserva 2048). La base lo mide en bytes: ver migración. */
export const MAX_LAYERS_PARAMS_LENGTH = 16384;
/** Tope, en caracteres del JSON, de `params` completo cuando trae `variants` (cada variante conserva el de arriba). La base lo mide en bytes: ver migración. */
export const MAX_VARIANTS_PARAMS_LENGTH = 65536;

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

export interface LayerBase {
  /** Fracción del ancho del lienzo donde cae el ancla (0 a 1; admite un poco fuera). */
  x?: number;
  /** Fracción del alto del lienzo. */
  y?: number;
  /**
   * Desplazamiento desde (`x`, `y`), relativo al lado menor (como los tamaños). Es lo que permite pegar una capa a un
   * borde o una esquina (`x: 1, dx: -0.1`) y que siga ahí en vertical, en horizontal o en una cámara 9:16.
   */
  dx?: number;
  dy?: number;
  /** Grados, en sentido horario. */
  rotation?: number;
  opacity?: number;
  anchor?: LayerAnchor;
  shadow?: LayerShadow;
  /** Bloquea la selección y transformación en el estudio de diseño. */
  locked?: boolean;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  /** Alto del texto, relativo al lado menor. */
  size?: number;
  font?: LayerFont;
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
  /**
   * Solo `rect` y `line`: la forma queda pegada a los bordes del lienzo, con márgenes relativos al lado menor.
   * Con `l` y `r` el ancho sale del lienzo (con `t` y `b`, el alto); con un solo borde se usa `w` o `h` y la forma
   * queda pegada a ese borde. Se ignoran `x`, `y`, `dx`, `dy`, el ancla y la rotación.
   */
  box?: LayerBox;
}

export interface LayerBox {
  l?: number;
  t?: number;
  r?: number;
  b?: number;
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

export interface AssetLayer extends LayerBase {
  type: 'asset';
  /** Referencia 'pack:<pack-id>/<asset-id>' */
  asset: string;
  w: number;
  h: number;
  /** Color #RRGGBB opcional para recolorear SVGs recoloreables ($acento). */
  tint?: string;
}

export type FrameLayer = TextLayer | ShapeLayer | ImageLayer | EmojiLayer | AssetLayer;
export type Layer = FrameLayer;

export interface FrameAssets {
  /** Imágenes ya cargadas, por la ruta `src` de la capa o clave `asset` (`pack:<pack-id>/<asset-id>[@#rrggbb]`). */
  images: ReadonlyMap<string, CanvasImageSource>;
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const PATH_PATTERN = /^[MLCZ0-9.,\s-]+$/;
const IMAGE_SRC_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/frames\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;
const ASSET_REF_PATTERN = /^pack:[a-z0-9][a-z0-9-]{0,49}\/[a-z0-9][a-z0-9-]{0,49}$/;

const BOX_EDGES = ['l', 't', 'r', 'b'];
const COMMON_KEYS = ['type', 'x', 'y', 'dx', 'dy', 'rotation', 'opacity', 'anchor', 'shadow', 'locked'];
const KEYS_BY_TYPE: Record<FrameLayer['type'], Set<string>> = {
  text: new Set([...COMMON_KEYS, 'text', 'size', 'font', 'color', 'weight', 'w', 'strokeColor', 'strokeWidth']),
  shape: new Set([...COMMON_KEYS, 'shape', 'w', 'h', 'fill', 'stroke', 'strokeWidth', 'radius', 'd', 'box']),
  image: new Set([...COMMON_KEYS, 'src', 'w', 'h', 'full']),
  emoji: new Set([...COMMON_KEYS, 'emoji', 'size']),
  asset: new Set([...COMMON_KEYS, 'asset', 'w', 'h', 'tint']),
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
  if ('dx' in l && !isNumberIn(l.dx, -2, 2)) return fail('El desplazamiento de la capa está fuera de rango.');
  if ('dy' in l && !isNumberIn(l.dy, -2, 2)) return fail('El desplazamiento de la capa está fuera de rango.');
  if ('rotation' in l && !isNumberIn(l.rotation, -360, 360)) return fail('La rotación va entre -360 y 360 grados.');
  if ('opacity' in l && !isNumberIn(l.opacity, 0, 1)) return fail('La opacidad va entre 0 y 1.');
  if ('anchor' in l && !LAYER_ANCHORS.includes(l.anchor as LayerAnchor)) return fail('Ancla desconocida.');
  if ('locked' in l && typeof l.locked !== 'boolean') return fail('El bloqueo de la capa no es válido.');
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
      if ('font' in l && !LAYER_FONTS.includes(l.font as LayerFont)) return fail('Tipografía no disponible.');
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
      if ('box' in l) {
        const box = l.box;
        const edges = typeof box === 'object' && box !== null && !Array.isArray(box) ? (box as Record<string, unknown>) : null;
        if (
          (l.shape !== 'rect' && l.shape !== 'line') ||
          !edges ||
          Object.keys(edges).length === 0 ||
          Object.entries(edges).some(([key, value]) => !BOX_EDGES.includes(key) || !isNumberIn(value, 0, 1))
        ) {
          return fail('La caja pegada a los bordes no es válida.');
        }
      }
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
    case 'asset': {
      if (typeof l.asset !== 'string' || !ASSET_REF_PATTERN.test(l.asset)) {
        return fail('El recurso del paquete no es válido.');
      }
      if (!isNumberIn(l.w, 0, 4) || !isNumberIn(l.h, 0, 4)) {
        return fail('El tamaño del recurso está fuera de rango.');
      }
      if ('tint' in l && !isColor(l.tint)) {
        return fail('Los colores deben ser como #RRGGBB.');
      }
      return { ok: true };
    }
  }
}

/** Valida la lista completa de capas (tope de cantidad incluido). */
export function validateLayers(layers: unknown, _eventId?: string): ValidationResult {
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
// Imágenes y recursos de paquetes
// ---------------------------------------------------------------------------

/** Clave única de caché para una capa `asset` (incluye `tint` si recolorea el SVG). */
export function assetLayerKey(layer: Pick<AssetLayer, 'asset' | 'tint'>): string {
  return layer.tint ? `${layer.asset}@${layer.tint.toLowerCase()}` : layer.asset;
}

/** Tipografías de las capas de texto, sin repetir (las que no declaran una usan `sans`). */
export function collectLayerFonts(layers: readonly FrameLayer[]): LayerFont[] {
  const fonts: LayerFont[] = [];
  for (const layer of layers) {
    if (layer.type !== 'text') continue;
    const font = layer.font ?? 'sans';
    if (!fonts.includes(font)) fonts.push(font);
  }
  return fonts;
}

/** Rutas de las imágenes que usan las capas, sin repetir y en orden de aparición. */
export function collectImagePaths(layers: readonly FrameLayer[]): string[] {
  const paths: string[] = [];
  for (const layer of layers) {
    if (layer.type === 'image' && !paths.includes(layer.src)) paths.push(layer.src);
  }
  return paths;
}

/** Claves de recursos `asset` (`pack:<pack-id>/<asset-id>[@#rrggbb]`), sin repetir y en orden de aparición. */
export function collectAssetKeys(layers: readonly FrameLayer[]): string[] {
  const keys: string[] = [];
  for (const layer of layers) {
    if (layer.type !== 'asset') continue;
    const key = assetLayerKey(layer);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function loadImage(url: string): Promise<CanvasImageSource> {
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
 * Descarga las imágenes, recursos de paquetes (`asset`) y tipografías web de las capas antes de dibujar
 * (`renderFrame` es síncrona). `resolveUrl` convierte la ruta de Storage en una URL; una imagen
 * que falla se deja fuera y el resto del marco se dibuja igual.
 */
export async function prepareFrameAssets(
  layers: readonly FrameLayer[],
  resolveUrl: (path: string) => string | Promise<string> = (p) => p,
  load: (url: string) => Promise<CanvasImageSource> = loadImage,
  loadFonts: (fonts: readonly string[]) => Promise<void> = loadLayerFonts,
  resolveAsset: (assetKey: string) => string | Promise<string> = resolvePackAssetUrl,
): Promise<FrameAssets> {
  const paths = collectImagePaths(layers);
  const assetKeys = collectAssetKeys(layers);
  const useDefaultCache = load === loadImage && resolveAsset === resolvePackAssetUrl;

  const [imageResults, assetResults] = await Promise.all([
    Promise.allSettled(paths.map(async (path) => load(await resolveUrl(path)))),
    Promise.allSettled(
      assetKeys.map(async (key) => {
        if (useDefaultCache) {
          const cached = getCachedPackAssetImage(key);
          if (cached) return cached;
        }
        const uri = await resolveAsset(key);
        const img = await load(uri);
        if (useDefaultCache) setCachedPackAssetImage(key, img);
        return img;
      }),
    ),
    loadFonts(collectLayerFonts(layers)),
  ]);
  const images = new Map<string, CanvasImageSource>();
  imageResults.forEach((result, i) => {
    if (result.status === 'fulfilled') images.set(paths[i], result.value);
  });
  assetResults.forEach((result, i) => {
    if (result.status === 'fulfilled') images.set(assetKeys[i], result.value);
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

/** Ancho y alto de la caja de la capa en píxeles (`unit` es el lado menor del lienzo). */
export function layerSize(layer: FrameLayer, unit: number): [number, number] {
  switch (layer.type) {
    case 'text':
      return [(layer.w ?? 2) * unit, (layer.size ?? 0.06) * unit];
    case 'emoji': {
      const side = (layer.size ?? 0.1) * unit;
      return [side, side];
    }
    case 'shape':
      return [(layer.w ?? 0.2) * unit, layer.shape === 'line' ? 0 : (layer.h ?? 0.2) * unit];
    case 'image':
      return [(layer.w ?? 0) * unit, (layer.h ?? 0) * unit];
    case 'asset':
      return [layer.w * unit, layer.h * unit];
  }
}

/** Esquina superior izquierda de la caja respecto del punto de anclaje. */
export function anchorOffset(anchor: LayerAnchor, bw: number, bh: number): [number, number] {
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

/**
 * Caja en píxeles (x, y, ancho, alto) de un `rect` o `line` con `box`: pegada a los bordes del lienzo con márgenes
 * relativos al lado menor, así que sigue pegada aunque cambie la proporción (vertical, horizontal, 9:16).
 */
export function boxRect(layer: ShapeLayer, w: number, h: number, unit: number): [number, number, number, number] {
  const box = layer.box ?? {};
  const axis = (start: number | undefined, end: number | undefined, total: number, size: number): [number, number] => {
    if (start !== undefined && end !== undefined) return [start * unit, Math.max(0, total - (start + end) * unit)];
    if (start !== undefined) return [start * unit, size];
    if (end !== undefined) return [total - end * unit - size, size];
    return [(total - size) / 2, size];
  };
  const [x0, bw] = axis(box.l, box.r, w, (layer.w ?? 0.2) * unit);
  if (layer.shape === 'line') {
    // Una línea no tiene alto: va en el borde de arriba (`t`) o, si no, a `b` del de abajo.
    const y = box.t !== undefined ? box.t * unit : box.b !== undefined ? h - box.b * unit : h / 2;
    return [x0, y, bw, 0];
  }
  const [y0, bh] = axis(box.t, box.b, h, (layer.h ?? 0.2) * unit);
  return [x0, y0, bw, bh];
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

  if (layer.type === 'shape' && layer.box && (layer.shape === 'rect' || layer.shape === 'line')) {
    const [bx, by, bw, bh] = boxRect(layer, w, h, unit);
    paintShape(ctx, layer, unit, bx, by, bw, bh);
    return;
  }

  ctx.translate((layer.x ?? 0.5) * w + (layer.dx ?? 0) * unit, (layer.y ?? 0.5) * h + (layer.dy ?? 0) * unit);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);

  const [bw, bh] = layerSize(layer, unit);
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
    case 'asset': {
      const img = assets?.images.get(assetLayerKey(layer)) ?? assets?.images.get(layer.asset);
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
