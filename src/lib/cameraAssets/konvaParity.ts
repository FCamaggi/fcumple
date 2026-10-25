/**
 * Conversión bidireccional y paridad geométrica entre el modelo `FrameLayer[]`
 * (que dibuja `renderFrame` en Canvas 2D) y los nodos interactivos de `<Stage>`
 * en `react-konva`.
 *
 * Garantiza que:
 * 1. Cada capa en Konva tenga exactamente la misma caja, centro, ancla y rotación que en `drawLayers`.
 * 2. Al soltar (`onDragEnd` / `onTransformEnd`), la posición final en píxeles se convierta a
 *    coordenadas ancladas al borde o esquina más cercano (`x`, `y` en `0 | 0.5 | 1` + `dx`, `dy`
 *    relativos al lado menor `unit`), para que el diseño migre solo entre `3:4`, `4:3`, `9:16` y `1:1`.
 */

import { anchorOffset, boxRect, layerSize, type FrameLayer } from './layers';
import { isBoxed, isLocked, layerBounds } from './layerOps';

export const ASPECT_RATIOS = ['3:4', '4:3', '9:16', '1:1'] as const;
export type CanvasAspectRatio = (typeof ASPECT_RATIOS)[number];

export const BASE_STAGE_UNIT = 270;

export const ASPECT_RATIO_DIMENSIONS: Record<
  CanvasAspectRatio,
  { width: number; height: number; label: string; shortLabel: string }
> = {
  '3:4': { width: 270, height: 360, label: '3:4 Vertical (base)', shortLabel: '3:4' },
  '4:3': { width: 360, height: 270, label: '4:3 Horizontal', shortLabel: '4:3' },
  '9:16': { width: 270, height: 480, label: '9:16 Historia', shortLabel: '9:16' },
  '1:1': { width: 270, height: 270, label: '1:1 Cuadrado', shortLabel: '1:1' },
};

/** Cuánto se permite achicar o agrandar el lienzo respecto de su tamaño base. */
export const STAGE_SCALE_MIN = 0.6;
export const STAGE_SCALE_MAX = 3;

/**
 * Tamaño en píxeles CSS del lienzo de edición para el espacio disponible: la
 * proporción se conserva y el lienzo crece hasta ocupar el ancho o el alto que
 * haya, dentro de `STAGE_SCALE_MIN`–`STAGE_SCALE_MAX`. Las capas se miden
 * relativas al lado menor, así que cualquier tamaño dibuja lo mismo.
 */
export function fitStageSize(
  ratio: CanvasAspectRatio,
  availableWidth: number,
  availableHeight: number,
): { width: number; height: number } {
  const base = ASPECT_RATIO_DIMENSIONS[ratio];
  const fit = Math.min(availableWidth / base.width, availableHeight / base.height);
  const scale = clamp(Number.isFinite(fit) ? fit : 1, STAGE_SCALE_MIN, STAGE_SCALE_MAX);
  return { width: Math.round(base.width * scale), height: Math.round(base.height * scale) };
}

export const ROTATION_SNAP_ANGLES = [-180, -135, -90, -45, 0, 45, 90, 135, 180] as const;
export const ROTATION_SNAP_TOLERANCE = 5;
export const SMART_GUIDE_SNAP_PX = 6;

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export interface KonvaNodeGeometry {
  /** Posición X del punto de anclaje del nodo en el Stage de Konva (px). */
  x: number;
  /** Posición Y del punto de anclaje del nodo en el Stage de Konva (px). */
  y: number;
  /** Ancho de la caja local del nodo (px). */
  width: number;
  /** Alto de la caja local del nodo (px). */
  height: number;
  /** Desplazamiento del origen local de Konva respecto a la esquina superior izquierda (px). */
  offsetX: number;
  offsetY: number;
  /** Centro visual de la caja en coordenadas del Stage (px), idéntico a `layerBounds`. */
  cx: number;
  cy: number;
  /** Rotación en grados en sentido horario. */
  rotation: number;
  opacity: number;
  draggable: boolean;
  transformable: boolean;
}

/**
 * Convierte una `FrameLayer` a las propiedades geométricas exactas de su nodo en `react-konva`.
 */
export function layerToKonvaGeometry(
  layer: FrameLayer,
  stageWidth: number,
  stageHeight: number,
): KonvaNodeGeometry {
  const unit = Math.min(stageWidth, stageHeight);
  const opacity = layer.opacity ?? 1;
  const locked = isLocked(layer);

  if (layer.type === 'image' && layer.full === true) {
    return {
      x: 0,
      y: 0,
      width: stageWidth,
      height: stageHeight,
      offsetX: 0,
      offsetY: 0,
      cx: stageWidth / 2,
      cy: stageHeight / 2,
      rotation: 0,
      opacity,
      draggable: false,
      transformable: false,
    };
  }

  if (layer.type === 'shape' && layer.box && (layer.shape === 'rect' || layer.shape === 'line')) {
    const [bx, by, bw, bh] = boxRect(layer, stageWidth, stageHeight, unit);
    return {
      x: bx,
      y: by,
      width: bw,
      height: bh,
      offsetX: 0,
      offsetY: 0,
      cx: bx + bw / 2,
      cy: by + bh / 2,
      rotation: 0,
      opacity,
      draggable: false,
      transformable: false,
    };
  }

  const [bw, bh] = layerSize(layer, unit);
  const [ox, oy] = anchorOffset(layer.anchor ?? 'center', bw, bh);
  const x = (layer.x ?? 0.5) * stageWidth + (layer.dx ?? 0) * unit;
  const y = (layer.y ?? 0.5) * stageHeight + (layer.dy ?? 0) * unit;
  const rotation = layer.rotation ?? 0;
  const bounds = layerBounds(layer, stageWidth, stageHeight);

  return {
    x,
    y,
    width: bw,
    height: bh,
    offsetX: -ox,
    offsetY: -oy,
    cx: bounds.cx,
    cy: bounds.cy,
    rotation,
    opacity,
    draggable: !locked,
    transformable: !locked,
  };
}

/**
 * Imanta un ángulo en grados a `0°, ±45°, ±90°, ±135°, ±180°` si cae dentro de `tolerance`.
 */
export function snapRotationAngle(deg: number, tolerance = ROTATION_SNAP_TOLERANCE): number {
  let norm = ((deg % 360) + 540) % 360 - 180;
  if (norm <= -180) norm = 180;
  for (const target of ROTATION_SNAP_ANGLES) {
    if (Math.abs(norm - target) <= tolerance) {
      return target === -180 ? 180 : target === 0 ? 0 : target;
    }
  }
  const rounded = Math.round(norm * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

export interface SmartGuidesState {
  x: number;
  y: number;
  verticalCenter: boolean;
  horizontalCenter: boolean;
}

/**
 * Calcula si el punto `(x, y)` se imanta al centro horizontal (`stageWidth / 2`)
 * o vertical (`stageHeight / 2`) del lienzo y devuelve la posición corregida más
 * las banderas de las guías activas.
 */
export function computeSmartGuides(
  x: number,
  y: number,
  stageWidth: number,
  stageHeight: number,
  snapPx = SMART_GUIDE_SNAP_PX,
): SmartGuidesState {
  const centerX = stageWidth / 2;
  const centerY = stageHeight / 2;
  const verticalCenter = Math.abs(x - centerX) <= snapPx;
  const horizontalCenter = Math.abs(y - centerY) <= snapPx;
  return {
    x: verticalCenter ? centerX : x,
    y: horizontalCenter ? centerY : y,
    verticalCenter,
    horizontalCenter,
  };
}

/**
 * Convierte una posición en píxeles `(px, py)` sobre el lienzo a coordenadas ancladas
 * al borde o esquina más cercano (`x`, `y` en `0 | 0.5 | 1` + `dx`, `dy` relativos a `unit`).
 */
export function pixelToAnchoredPosition(
  px: number,
  py: number,
  stageWidth: number,
  stageHeight: number,
): { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1; dx?: number; dy?: number } {
  const unit = Math.min(stageWidth, stageHeight);
  const ax: 0 | 0.5 | 1 = px < stageWidth * 0.35 ? 0 : px > stageWidth * 0.65 ? 1 : 0.5;
  const ay: 0 | 0.5 | 1 = py < stageHeight * 0.35 ? 0 : py > stageHeight * 0.65 ? 1 : 0.5;

  const rawDx = round4(clamp((px - ax * stageWidth) / unit, -2, 2));
  const rawDy = round4(clamp((py - ay * stageHeight) / unit, -2, 2));

  const out: { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1; dx?: number; dy?: number } = { x: ax, y: ay };
  if (Math.abs(rawDx) >= 1e-4) out.dx = rawDx;
  if (Math.abs(rawDy) >= 1e-4) out.dy = rawDy;
  return out;
}

export interface KonvaTransformInput {
  /** Posición X final del nodo en el Stage (px). */
  x: number;
  /** Posición Y final del nodo en el Stage (px). */
  y: number;
  /** Factor de escala horizontal aplicado por `<Transformer />` (1 si solo se arrastró). */
  scaleX?: number;
  /** Factor de escala vertical aplicado por `<Transformer />` (1 si solo se arrastró). */
  scaleY?: number;
  /** Rotación final en grados. */
  rotation?: number;
}

/**
 * Aplica el resultado de un `onDragEnd` o `onTransformEnd` de Konva sobre una `FrameLayer`,
 * actualizando su anclaje a bordes (`x`, `y`, `dx`, `dy`), su tamaño (`w`, `h`, `size`) y su rotación.
 */
export function applyKonvaNodeTransform(
  layer: FrameLayer,
  transform: KonvaTransformInput,
  stageWidth: number,
  stageHeight: number,
): FrameLayer {
  if ((layer.type === 'image' && layer.full === true) || isBoxed(layer) || isLocked(layer)) {
    return layer;
  }

  const anchored = pixelToAnchoredPosition(transform.x, transform.y, stageWidth, stageHeight);
  const sx = Math.abs(transform.scaleX ?? 1);
  const sy = Math.abs(transform.scaleY ?? 1);
  const uniformScale = (sx + sy) / 2;

  const baseCopy = { ...layer } as Record<string, unknown>;
  delete baseCopy.dx;
  delete baseCopy.dy;
  Object.assign(baseCopy, anchored);

  if (transform.rotation !== undefined) {
    baseCopy.rotation = snapRotationAngle(transform.rotation);
  }

  const side = (v: number, factor: number) => round4(clamp(v * factor, 0.01, 4));

  switch (layer.type) {
    case 'text': {
      return {
        ...(baseCopy as unknown as typeof layer),
        size: round4(clamp((layer.size ?? 0.06) * sy, 0.005, 1)),
        ...(layer.w !== undefined ? { w: round4(clamp(layer.w * sx, 0.05, 4)) } : {}),
      };
    }
    case 'emoji': {
      return {
        ...(baseCopy as unknown as typeof layer),
        size: round4(clamp((layer.size ?? 0.1) * uniformScale, 0.01, 1)),
      };
    }
    case 'shape': {
      return {
        ...(baseCopy as unknown as typeof layer),
        w: side(layer.w ?? 0.2, sx),
        ...(layer.shape === 'line' ? {} : { h: side(layer.h ?? 0.2, sy) }),
      };
    }
    case 'image': {
      return {
        ...(baseCopy as unknown as typeof layer),
        w: side(layer.w ?? 0.5, sx),
        h: side(layer.h ?? 0.5, sy),
      };
    }
    case 'asset': {
      return {
        ...(baseCopy as unknown as typeof layer),
        w: side(layer.w, sx),
        h: side(layer.h, sy),
      };
    }
  }
}

/** Recuadro guía de «Zona segura para caras» (en píxeles del Stage). */
export function safeFaceZoneRect(
  stageWidth: number,
  stageHeight: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(stageWidth * 0.2),
    y: Math.round(stageHeight * 0.18),
    width: Math.round(stageWidth * 0.6),
    height: Math.round(stageHeight * 0.54),
  };
}
