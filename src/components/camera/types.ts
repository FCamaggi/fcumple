import type { VariantRatio } from '../../lib/cameraAssets/frames';
import type { StickerAsset } from '../../lib/cameraAssets/stickers';

/**
 * Un marco listo para la cámara. `draw === null` representa "Sin marco".
 */
export interface CameraFrameOption {
  /** Identificador único del marco (o 'none' para sin marco). */
  id: string;
  /** Nombre visible del marco en el carrusel o selector. */
  label: string;
  /** Dibuja el marco sobre el canvas con el tamaño y la proporción indicados (`null` para "Sin marco"). */
  draw: ((ctx: CanvasRenderingContext2D, width: number, height: number, ratio: VariantRatio) => void) | null;
  /** Proporciones donde el marco tiene diseño disponible; `undefined` si vale para todas. */
  ratios?: readonly VariantRatio[];
  /** Carga los recursos gráficos de esa proporción bajo demanda; es idempotente. */
  ensure?: (ratio: VariantRatio) => Promise<void>;
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
