import { useEffect, useState } from 'react';
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
