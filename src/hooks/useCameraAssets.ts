import { useEffect, useRef, useState } from 'react';
import {
  VARIANT_RATIOS,
  renderFrame,
  sanitizeFrameParams,
  variantLayers,
  type VariantRatio,
} from '../lib/cameraAssets/frames';
import { prepareFrameAssets, type FrameAssets } from '../lib/cameraAssets/layers';
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

        // Por cada marco se crea su función de dibujo y la carga bajo demanda (ensure)
        // por proporción. La carga inicial solo asegura '3:4'.
        const frameOptions: CameraFrameOption[] = frames.map((f): CameraFrameOption => {
          if (f.template !== 'capas') {
            return {
              id: f.id,
              label: f.label,
              draw: null,
              ratios: [],
              ensure: async () => {},
            };
          }

          const sanitized = sanitizeFrameParams(f.params);
          const ratios = VARIANT_RATIOS.filter((r) => variantLayers(sanitized, r) !== undefined);
          const assetsCache = new Map<VariantRatio, FrameAssets>();
          const promiseCache = new Map<VariantRatio, Promise<void>>();

          const ensure = (ratio: VariantRatio): Promise<void> => {
            const cachedPromise = promiseCache.get(ratio);
            if (cachedPromise) return cachedPromise;
            if (assetsCache.has(ratio)) return Promise.resolve();

            const layers = variantLayers(sanitized, ratio);
            if (layers === undefined) {
              const p = Promise.resolve();
              promiseCache.set(ratio, p);
              return p;
            }

            const p = (async () => {
              const prepared = await prepareFrameAssets(layers, getStickerImageUrl);
              assetsCache.set(ratio, prepared);
            })();
            promiseCache.set(ratio, p);
            return p;
          };

          const draw = (
            ctx: CanvasRenderingContext2D,
            width: number,
            height: number,
            ratio: VariantRatio,
          ) => {
            const layers = variantLayers(sanitized, ratio);
            if (!layers) return;
            const { variants: _ignored, ...paramsWithoutVariants } = sanitized;
            const frameParams = { ...paramsWithoutVariants, layers };
            const assetsForRatio = assetsCache.get(ratio);
            renderFrame(ctx, width, height, f.template, frameParams, assetsForRatio);
          };

          return {
            id: f.id,
            label: f.label,
            draw,
            ratios,
            ensure,
          };
        });

        // Asegurar 3:4 para todos los marcos en la carga inicial y cargar stickers en paralelo.
        const [, stickerOptions] = await Promise.all([
          Promise.all(frameOptions.map((opt) => opt.ensure?.('3:4'))),
          Promise.all(
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
          ),
        ]);

        const validStickers = stickerOptions.filter((o): o is CameraStickerOption => o !== null);

        if (active) {
          setAssets({
            status: 'ready',
            frames: frameOptions,
            stickers: validStickers,
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
