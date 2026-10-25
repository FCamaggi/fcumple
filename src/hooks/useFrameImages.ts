import { useEffect, useState } from 'react';
import { loadImage } from '../lib/cameraAssets/layers';
import { getCachedPackAssetImage, resolvePackAssetUrl, setCachedPackAssetImage } from '../lib/cameraAssets/packs';
import { FRAME_IMAGE_SRC, type FrameId } from '../lib/cameraFrames';

type LoadedFrameImages = Partial<Record<FrameId, HTMLImageElement>>;

/**
 * useFrameImages -- precarga los PNG de los 7 marcos reales (Etapa 12) al
 * montar `CameraCapture`, para que estén listos en memoria antes de que el
 * invitado llegue a disparar. Expone sólo las que ya terminaron de cargar
 * (`img.onload`), indexadas por `FrameId`.
 *
 * Decisión consciente: si el invitado dispara antes de que la imagen del
 * marco actual haya cargado, esa foto sale sin marco -- `drawFrame` recibe
 * `null` para ese id (ver CameraCapture.handleShoot) y no bloquea el
 * disparador esperando la red. Con 7 PNG de a lo sumo ~1MB cada uno y la
 * precarga arrancando al montar (antes de que el invitado interactúe con
 * nada), este caso es raro en la práctica.
 */
export function useFrameImages(): LoadedFrameImages {
  const [images, setImages] = useState<LoadedFrameImages>({});

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(FRAME_IMAGE_SRC) as [FrameId, string][];

    for (const [id, src] of entries) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setImages((prev) => ({ ...prev, [id]: img }));
      };
      img.src = src;
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return images;
}

/**
 * Precarga y cachea en memoria las imágenes de recursos de paquetes (`pack:<pack-id>/<asset-id>[@#rrggbb]`),
 * recoloreando los SVG mediante `recolorSvgToDataUri` (mismo origen, 0 egress de Supabase).
 */
export function usePackAssetImages(assetKeys: readonly string[]): ReadonlyMap<string, CanvasImageSource> {
  const keyStr = JSON.stringify(assetKeys);
  const [loaded, setLoaded] = useState<ReadonlyMap<string, CanvasImageSource>>(() => new Map());

  useEffect(() => {
    const keys = JSON.parse(keyStr) as string[];
    if (keys.length === 0) {
      setLoaded(new Map());
      return;
    }
    let cancelled = false;
    void Promise.allSettled(
      keys.map(async (key) => {
        const cached = getCachedPackAssetImage(key);
        if (cached) return [key, cached] as const;
        const uri = await resolvePackAssetUrl(key);
        const img = await loadImage(uri);
        setCachedPackAssetImage(key, img);
        return [key, img] as const;
      }),
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<string, CanvasImageSource>();
      for (const r of results) {
        if (r.status === 'fulfilled') next.set(r.value[0], r.value[1]);
      }
      setLoaded(next);
    });
    return () => {
      cancelled = true;
    };
  }, [keyStr]);

  return loaded;
}
