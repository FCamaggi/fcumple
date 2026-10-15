import { useEffect, useState } from 'react';
import { renderFrame } from '../lib/cameraAssets/frames';
import { getStickerImageUrl, listCameraAssets } from '../lib/platformGuestApi';
import type { CameraFrameOption, CameraStickerOption } from '../components/camera/types';

export type CameraAssetsStatus = 'idle' | 'loading' | 'ready' | 'error';

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
 * Marcos y stickers activos del evento del invitado, listos para la cámara: los
 * marcos como funciones de dibujo y las imágenes ya cargadas. Un sticker cuya
 * imagen no carga simplemente no aparece; nunca bloquea la cámara.
 */
export function useCameraAssets(token: string, enabled: boolean): CameraAssets {
  const [assets, setAssets] = useState<CameraAssets>(EMPTY);

  useEffect(() => {
    if (!enabled) {
      setAssets(EMPTY);
      return;
    }
    let active = true;
    setAssets({ ...EMPTY, status: 'loading' });

    async function load() {
      try {
        const { frames, stickers } = await listCameraAssets(token);

        const frameOptions: CameraFrameOption[] = frames.map((f) => ({
          id: f.id,
          label: f.label,
          draw: (ctx, width, height) => renderFrame(ctx, width, height, f.template, f.params),
        }));

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
