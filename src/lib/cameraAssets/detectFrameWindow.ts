import { detectWindow, type Rect } from './capture';
import { loadImage } from './layers';
import { computeTargetSize } from './stickers';

export const DETECT_MAX_SIDE = 256;

/**
 * Dibuja la imagen achicada (lado mayor <= 256 px) en un canvas fuera de pantalla y busca su ventana
 * transparente con `detectWindow`. Si el navegador no puede leer los píxeles (CORS, imagen rota o sin
 * tamaño), devuelve `null` para no interrumpir la subida.
 */
export function detectFrameWindow(
  image: CanvasImageSource,
  naturalWidth?: number,
  naturalHeight?: number,
): Rect | null {
  const dims = image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const iw = naturalWidth ?? dims.naturalWidth ?? dims.width ?? 0;
  const ih = naturalHeight ?? dims.naturalHeight ?? dims.height ?? 0;
  if (iw <= 0 || ih <= 0) return null;

  const { width, height } = computeTargetSize(iw, ih, DETECT_MAX_SIDE);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const dataW = imageData.data.length === width * height * 4 ? width : imageData.width || width;
    const dataH = imageData.data.length === width * height * 4 ? height : imageData.height || height;
    if (imageData.data.length < dataW * dataH * 4) return null;
    return detectWindow(imageData.data, dataW, dataH);
  } catch {
    return null;
  }
}

/**
 * Carga la imagen de `url` y busca su ventana. `null` si no carga o no tiene ventana: nunca lanza, así una
 * falla de red o de CORS deja la capa como estaba.
 */
export async function detectUrlWindow(url: string): Promise<Rect | null> {
  try {
    const image = await loadImage(url);
    return detectFrameWindow(image);
  } catch {
    return null;
  }
}
