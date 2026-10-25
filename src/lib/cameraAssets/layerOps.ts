/**
 * Operaciones puras del editor de capas: crear, ordenar, mover, escalar, rotar y
 * seleccionar capas por punto. No tocan el DOM ni el canvas, así que se prueban
 * sin navegador; el editor visual solo las llama desde los eventos del puntero.
 *
 * Todas devuelven listas y capas NUEVAS (nunca mutan) y nunca producen una capa
 * que `validateLayers` rechace: los valores se cortan en los límites.
 */

import { MAX_LAYERS, anchorOffset, boxRect, layerSize, type FrameLayer } from './layers';

export type NewLayerKind = 'text' | 'rect' | 'ellipse' | 'line' | 'path' | 'emoji' | 'image' | 'asset';

/** Corazón en la caja de 100 × 100 que usan los trazos. */
const HEART_PATH = 'M50 90 C10 60 0 30 25 15 C40 8 50 20 50 28 C50 20 60 8 75 15 C100 30 90 60 50 90 Z';

const PINK = '#ff4fa3';

export interface CreateLayerOptions {
  src?: string;
  full?: boolean;
  asset?: string;
  tint?: string;
  w?: number;
  h?: number;
}

/** Una capa nueva de cada tipo, centrada y con valores que se ven bien sobre una foto. */
export function createLayer(kind: NewLayerKind, options: CreateLayerOptions = {}): FrameLayer {
  const at = { x: 0.5, y: 0.5 };
  switch (kind) {
    case 'text':
      return { type: 'text', text: 'Texto', ...at, size: 0.08, w: 1.2, font: 'anton', color: '#ffffff' };
    case 'rect':
      return { type: 'shape', shape: 'rect', ...at, w: 0.4, h: 0.2, fill: PINK };
    case 'ellipse':
      return { type: 'shape', shape: 'ellipse', ...at, w: 0.3, h: 0.3, fill: PINK };
    case 'line':
      return { type: 'shape', shape: 'line', ...at, w: 0.5, stroke: '#ffffff', strokeWidth: 0.01 };
    case 'path':
      return { type: 'shape', shape: 'path', ...at, w: 0.3, h: 0.3, d: HEART_PATH, fill: PINK };
    case 'emoji':
      return { type: 'emoji', emoji: '✨', ...at, size: 0.12 };
    case 'image':
      if (options.full) return { type: 'image', src: options.src ?? '', full: true };
      return { type: 'image', src: options.src ?? '', ...at, w: 0.5, h: 0.5 };
    case 'asset':
      return {
        type: 'asset',
        asset: options.asset ?? 'pack:halloween-neon/murcielago',
        ...at,
        w: options.w ?? 0.25,
        h: options.h ?? 0.25,
        ...(options.tint ? { tint: options.tint } : {}),
      };
  }
}

const isCover = (layer: FrameLayer) => layer.type === 'image' && layer.full === true;
/** Una forma pegada a los bordes (`box`): como la imagen a pantalla completa, su lugar lo fijan los bordes, no se arrastra. */
export const isBoxed = (layer: FrameLayer) => layer.type === 'shape' && layer.box !== undefined;
export const isLocked = (layer: FrameLayer) => layer.locked === true;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// ---------------------------------------------------------------------------
// Lista de capas
// ---------------------------------------------------------------------------

export interface LayersChange {
  layers: FrameLayer[];
  /** Capa que queda seleccionada; -1 si ninguna o si la operación no hizo nada. */
  index: number;
}

/** Agrega la capa arriba de todo. Con el tope de capas no agrega (índice -1). */
export function addLayer(layers: FrameLayer[], layer: FrameLayer): LayersChange {
  if (layers.length >= MAX_LAYERS) return { layers, index: -1 };
  return { layers: [...layers, layer], index: layers.length };
}

export function updateLayer(layers: FrameLayer[], index: number, patch: Partial<FrameLayer>): FrameLayer[] {
  if (index < 0 || index >= layers.length) return layers;
  const next = layers.slice();
  next[index] = { ...layers[index], ...patch } as FrameLayer;
  return next;
}

/** Borra y deja seleccionada la capa anterior (o la primera). */
export function removeLayer(layers: FrameLayer[], index: number): LayersChange {
  if (index < 0 || index >= layers.length) return { layers, index: -1 };
  const next = layers.filter((_, i) => i !== index);
  return { layers: next, index: next.length === 0 ? -1 : Math.min(Math.max(index - 1, 0), next.length - 1) };
}

/** Copia la capa justo encima, un poco corrida para que se note. */
export function duplicateLayer(layers: FrameLayer[], index: number): LayersChange {
  const layer = layers[index];
  if (!layer || isCover(layer) || layers.length >= MAX_LAYERS) return { layers, index: -1 };
  const copy = { ...layer, x: round4(clamp((layer.x ?? 0.5) + 0.03, -1, 2)), y: round4(clamp((layer.y ?? 0.5) + 0.03, -1, 2)) };
  const next = layers.slice();
  next.splice(index + 1, 0, copy);
  return { layers: next, index: index + 1 };
}

/** Cambia el orden de apilado: «up» acerca la capa al frente (índice mayor). */
export function reorderLayer(layers: FrameLayer[], index: number, direction: 'up' | 'down' | 'front' | 'back'): LayersChange {
  if (index < 0 || index >= layers.length) return { layers, index: -1 };
  const target =
    direction === 'up' ? index + 1 : direction === 'down' ? index - 1 : direction === 'front' ? layers.length - 1 : 0;
  if (target < 0 || target >= layers.length || target === index) return { layers, index };
  const next = layers.slice();
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return { layers: next, index: target };
}

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------

export interface LayerBounds {
  /** Centro de la caja en píxeles del lienzo (ya aplicada la rotación alrededor del ancla). */
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** Grados. */
  rotation: number;
}

/** La caja de una capa en el lienzo; coincide con lo que dibuja `drawLayers`. */
export function layerBounds(layer: FrameLayer, w: number, h: number): LayerBounds {
  if (isCover(layer)) return { cx: w / 2, cy: h / 2, width: w, height: h, rotation: 0 };

  const unit = Math.min(w, h);
  if (layer.type === 'shape' && layer.box && (layer.shape === 'rect' || layer.shape === 'line')) {
    const [bx, by, boxW, boxH] = boxRect(layer, w, h, unit);
    return { cx: bx + boxW / 2, cy: by + boxH / 2, width: boxW, height: boxH, rotation: 0 };
  }
  const [bw, bh] = layerSize(layer, unit);
  const [ox, oy] = anchorOffset(layer.anchor ?? 'center', bw, bh);
  const lx = ox + bw / 2;
  const ly = oy + bh / 2;
  const rotation = layer.rotation ?? 0;
  const theta = (rotation * Math.PI) / 180;
  return {
    cx: (layer.x ?? 0.5) * w + (layer.dx ?? 0) * unit + lx * Math.cos(theta) - ly * Math.sin(theta),
    cy: (layer.y ?? 0.5) * h + (layer.dy ?? 0) * unit + lx * Math.sin(theta) + ly * Math.cos(theta),
    width: bw,
    height: bh,
    rotation,
  };
}

/** Mitad mínima de la zona tocable: una línea de 1 px de alto igual hay que poder tomarla. */
const MIN_HIT_HALF = 12;

/** La capa de más arriba que contiene el punto (en píxeles del lienzo), o -1. */
export function hitTest(layers: FrameLayer[], px: number, py: number, w: number, h: number): number {
  for (let i = layers.length - 1; i >= 0; i--) {
    // Las cajas pegadas a los bordes no se eligen con un clic en el lienzo (un anillo cubriría todo): van por la lista.
    if (isBoxed(layers[i])) continue;
    const b = layerBounds(layers[i], w, h);
    const theta = (b.rotation * Math.PI) / 180;
    const dx = px - b.cx;
    const dy = py - b.cy;
    const lx = dx * Math.cos(theta) + dy * Math.sin(theta);
    const ly = -dx * Math.sin(theta) + dy * Math.cos(theta);
    if (Math.abs(lx) <= Math.max(b.width / 2, MIN_HIT_HALF) && Math.abs(ly) <= Math.max(b.height / 2, MIN_HIT_HALF)) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Gestos
// ---------------------------------------------------------------------------

/** Mueve la capa; dx y dy en píxeles del lienzo. La imagen a pantalla completa no se mueve. */
export function moveLayer(layer: FrameLayer, dx: number, dy: number, w: number, h: number): FrameLayer {
  if (isCover(layer) || isBoxed(layer) || isLocked(layer)) return layer;
  return {
    ...layer,
    x: round4(clamp((layer.x ?? 0.5) + dx / w, -1, 2)),
    y: round4(clamp((layer.y ?? 0.5) + dy / h, -1, 2)),
  };
}

/** Escala el tamaño de la capa (no el grosor del borde). Corta en los límites que valida la base. */
export function scaleLayer(layer: FrameLayer, factor: number): FrameLayer {
  if (isCover(layer) || isBoxed(layer) || isLocked(layer)) return layer;
  const side = (value: number) => round4(clamp(value * factor, 0.01, 4));
  switch (layer.type) {
    case 'text':
      return {
        ...layer,
        size: round4(clamp((layer.size ?? 0.06) * factor, 0.005, 1)),
        ...(layer.w !== undefined ? { w: round4(clamp(layer.w * factor, 0.05, 4)) } : {}),
      };
    case 'emoji':
      return { ...layer, size: round4(clamp((layer.size ?? 0.1) * factor, 0.01, 1)) };
    case 'shape':
      return {
        ...layer,
        w: side(layer.w ?? 0.2),
        ...(layer.shape === 'line' ? {} : { h: side(layer.h ?? 0.2) }),
      };
    case 'image':
      return { ...layer, w: side(layer.w ?? 0.5), h: side(layer.h ?? 0.5) };
    case 'asset':
      return { ...layer, w: side(layer.w), h: side(layer.h) };
  }
}

export interface Point {
  x: number;
  y: number;
}

/** Razón de distancias al centro entre donde empezó el gesto y donde está el puntero. */
export function scaleFactorFromPointers(center: Point, start: Point, current: Point): number {
  const d0 = Math.hypot(start.x - center.x, start.y - center.y);
  if (d0 < 1e-6) return 1;
  return Math.max(Math.hypot(current.x - center.x, current.y - center.y) / d0, 0.01);
}

/** Si el ángulo está a menos de esto de un múltiplo de 15°, se imanta. */
const SNAP_TOLERANCE = 3;

/** Ángulo (grados, entre -180 y 180) del puntero respecto del centro: arriba es 0° y a la derecha 90°. */
export function rotationFromPointer(center: Point, pointer: Point): number {
  let deg = (Math.atan2(pointer.x - center.x, -(pointer.y - center.y)) * 180) / Math.PI;
  const nearest = Math.round(deg / 15) * 15;
  if (Math.abs(deg - nearest) < SNAP_TOLERANCE) deg = nearest;
  if (deg <= -180) deg += 360;
  const rounded = Math.round(deg * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}
