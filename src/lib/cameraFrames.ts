/**
 * cameraFrames -- marcos de foto de la cámara dedicada del invitado (Etapa
 * 9, Frente 1 del backlog; reemplazados por PNG reales en la Etapa 12).
 *
 * Cada marco es un PNG con canal alfa servido desde `public/marcos/` (ver
 * `FRAME_IMAGE_SRC`), ya no una rutina de dibujo Canvas 2D -- la
 * arquitectura de "dos capas mantenidas equivalentes a mano" de la Etapa 9
 * (preview CSS aparte de la rutina de dibujo) deja de hacer falta: tanto el
 * preview en vivo (`<img>` en CameraCapture.tsx) como la foto final
 * (`drawFrame` sobre el `<canvas>` real) dibujan el mismo PNG ya cargado.
 */

export type FrameId =
  | 'none'
  | 'disposable'
  | 'date-stamp'
  | 'light-leak'
  | 'cumple-fabrizio'
  | 'stickers'
  | 'viewfinder'
  | 'fcumple-tape';

export const FRAME_IDS: FrameId[] = [
  'none',
  'disposable',
  'date-stamp',
  'light-leak',
  'cumple-fabrizio',
  'stickers',
  'viewfinder',
  'fcumple-tape',
];

export const FRAME_LABELS: Record<FrameId, string> = {
  none: 'Sin marco',
  disposable: 'Desechable',
  'date-stamp': 'Fecha',
  'light-leak': 'Destello',
  'cumple-fabrizio': 'Cumple Fabrizio',
  stickers: 'Stickers',
  viewfinder: 'Visor',
  'fcumple-tape': 'Cinta FCumple',
};

/**
 * Ruta del PNG servido tal cual (fuera del bundle de Vite, mismo criterio
 * que og-image.jpg) para cada marco real -- `'none'` queda fuera a
 * propósito, no tiene imagen.
 */
export const FRAME_IMAGE_SRC: Partial<Record<FrameId, string>> = {
  disposable: '/marcos/1.png',
  'date-stamp': '/marcos/2.png',
  'light-leak': '/marcos/3.png',
  'cumple-fabrizio': '/marcos/4.png',
  stickers: '/marcos/5.png',
  viewfinder: '/marcos/6.png',
  'fcumple-tape': '/marcos/7.png',
};

/**
 * Navegación pura entre marcos dado un swipe -- lo único de la interacción
 * de marcos que es testable sin un gesto táctil real (ver
 * CameraCapture.tsx para el handler que la usa). Circular: swipe repetido
 * en el mismo sentido da la vuelta al carrusel en vez de trabarse en la
 * punta.
 */
export function getFrameIndexAfterSwipe(
  currentIndex: number,
  direction: 'left' | 'right',
  frameCount: number,
): number {
  if (frameCount <= 1) return 0;
  const delta = direction === 'left' ? 1 : -1;
  return (currentIndex + delta + frameCount) % frameCount;
}

/**
 * Dibuja el marco ya cargado sobre el canvas de captura, estirando para
 * llenar el cuadro entero (sin mantener proporción) -- misma estrategia de
 * escalado que el preview en vivo (`object-fill`, ver CameraCapture.tsx)
 * para que lo que el invitado ve coincida con la foto final. `image` es
 * `null` tanto para `'none'` como para un marco cuya imagen todavía no
 * terminó de cargar (ver `useFrameImages`).
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  width: number,
  height: number,
): void {
  if (!image) return;
  ctx.drawImage(image, 0, 0, width, height);
}
