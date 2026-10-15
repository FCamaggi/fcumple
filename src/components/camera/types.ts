import type { StickerAsset } from '../../lib/cameraAssets/stickers';

/** Un marco listo para dibujar. `draw === null` es "Sin marco". */
export interface CameraFrameOption {
  id: string;
  label: string;
  draw: ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | null;
}

/**
 * Un sticker disponible en la bandeja. `asset` es lo que se dibuja en el canvas
 * de la foto final; `previewSrc` es la URL que usa el DOM del preview (solo imágenes).
 */
export interface CameraStickerOption {
  id: string;
  label: string;
  asset: StickerAsset;
  previewSrc?: string;
}
