import { useEffect, useRef, useState } from 'react';
import { renderFrame } from '../lib/cameraAssets/frames';
import { prepareFrameAssets, sanitizeLayers, type FrameAssets, type FrameLayer } from '../lib/cameraAssets/layers';
import { getStickerImageUrl, listCameraAssets, type GuestFrame, type GuestSticker } from '../lib/platformGuestApi';
import type { CameraFrameOption, CameraStickerOption } from '../components/camera/types';

export type CameraAssetsStatus = 'idle' | 'loading' | 'ready' | 'error';
export type CameraAssetsLoader = () => Promise<{ frames: GuestFrame[]; stickers: GuestSticker[] }>;

export interface CameraAssets {
  status: CameraAssetsStatus;
  frames: CameraFrameOption[];
  stickers: CameraStickerOption[];
  /** El marco por defecto del evento, si hay uno. */
  initialFrameId: string | null;
}

const EMPTY: CameraAssets = { status: 'idle', frames: [], stickers: [], initialFrameId: null };

/**
 * Carga una imagen para dibujarla en el canvas de la foto. `crossOrigin =
 * 'anonymous'` es obligatorio: sin él, una imagen de otro origen (las URLs
 * firmadas de Storage lo son) "contamina" el canvas y `toBlob` falla.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image failed to load'));
    image.src = url;
  });
}

/**
 * Proporción (ancho / alto) de la imagen de un marco de imagen completa, ya cargada; `undefined` si el marco no
 * tiene una o su imagen no cargó (entonces no se esconde: se dibuja lo que haya).
 */
export function fullImageAspect(layers: readonly FrameLayer[], assets: FrameAssets | undefined): number | undefined {
  const layer = layers.find((l) => l.type === 'image' && l.full === true);
  if (!layer || layer.type !== 'image') return undefined;
  const image = assets?.images.get(layer.src) as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | undefined;
  const w = image?.naturalWidth || image?.width || 0;
  const h = image?.naturalHeight || image?.height || 0;
  return w > 0 && h > 0 ? w / h : undefined;
}

/**
 * Marcos y stickers activos del evento del invitado, listos para la cámara: los
 * marcos como funciones de dibujo y las imágenes ya cargadas. Un sticker cuya
 * imagen no carga simplemente no aparece; nunca bloquea la cámara.
 *
 * El tercer parámetro permite pasar una función de carga propia (por ejemplo la
 * de la vista previa del organizador, que lee con su sesión y no con un token).
 */
export function useCameraAssets(
  token: string,
  enabled: boolean,
  loadFn?: CameraAssetsLoader,
): CameraAssets {
  const [assets, setAssets] = useState<CameraAssets>(EMPTY);
  const loadFnRef = useRef(loadFn);
  loadFnRef.current = loadFn;

  useEffect(() => {
    if (!enabled) {
      setAssets(EMPTY);
      return;
    }
    let active = true;
    setAssets({ ...EMPTY, status: 'loading' });

    async function load() {
      try {
        const loader = loadFnRef.current ?? (() => listCameraAssets(token));
        const { frames, stickers } = await loader();

        // Un marco de capas necesita sus imágenes y tipografías ya cargadas: renderFrame es síncrona.
        // prepareFrameAssets nunca rechaza; lo que no carga se omite y el resto del marco se dibuja.
        const frameOptions: CameraFrameOption[] = await Promise.all(
          frames.map(async (f): Promise<CameraFrameOption> => {
            const layers = f.template === 'capas' ? sanitizeLayers(f.params.layers) : [];
            const assets = f.template === 'capas' ? await prepareFrameAssets(layers, getStickerImageUrl) : undefined;
            return {
              id: f.id,
              label: f.label,
              draw: (ctx, width, height) => renderFrame(ctx, width, height, f.template, f.params, assets),
              aspect: fullImageAspect(layers, assets),
            };
          }),
        );

        const stickerOptions = (
          await Promise.all(
            stickers.map(async (s): Promise<CameraStickerOption | null> => {
              if (s.kind === 'emoji' && s.emoji) {
                return { id: s.id, label: s.emoji, asset: { kind: 'emoji', emoji: s.emoji } };
              }
              if (s.kind === 'image' && s.storagePath) {
                try {
                  const url = await getStickerImageUrl(s.storagePath);
                  const image = await loadImage(url);
                  return { id: s.id, label: 'imagen', asset: { kind: 'image', image }, previewSrc: url };
                } catch {
                  return null;
                }
              }
              return null;
            }),
          )
        ).filter((o): o is CameraStickerOption => o !== null);

        if (active) {
          setAssets({
            status: 'ready',
            frames: frameOptions,
            stickers: stickerOptions,
            initialFrameId: frames.find((f) => f.isDefault)?.id ?? null,
          });
        }
      } catch {
        // Sin marcos ni stickers, la cámara igual funciona.
        if (active) setAssets({ ...EMPTY, status: 'error' });
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [token, enabled]);

  return assets;
}
