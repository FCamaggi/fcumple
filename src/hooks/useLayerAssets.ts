import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collectAssetKeys,
  collectImagePaths,
  collectLayerFonts,
  prepareFrameAssets,
  sanitizeLayers,
  type FrameAssets,
} from '../lib/cameraAssets/layers';
import { WEB_FONTS } from '../lib/cameraAssets/text';

const NO_RESOLVER = async (): Promise<string> => {
  throw new Error('Sin resolver de imágenes');
};

/**
 * Imágenes, recursos de paquetes (`asset`) y tipografías web que necesitan las capas
 * de un marco para dibujarse (el editor, las miniaturas y la cámara). Devuelve `undefined`
 * mientras cargan o si las capas no necesitan nada: `renderFrame` dibuja igual, sin esas imágenes.
 *
 * Solo recarga cuando cambia el CONJUNTO de imágenes, recursos o tipografías: mover
 * o escalar capas durante la edición no vuelve a descargar nada.
 * Mientras llega un conjunto nuevo se mantiene el anterior, así no parpadea.
 *
 * `resolveUrl` firma la ruta de Storage (quien llama sabe si es organizador o
 * invitado); no se importa aquí para que el hook no arrastre el cliente de Supabase.
 */
export function useLayerAssets(
  rawLayers: unknown,
  resolveUrl: (path: string) => Promise<string> = NO_RESOLVER,
): FrameAssets | undefined {
  const layers = useMemo(() => sanitizeLayers(rawLayers), [rawLayers]);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const key = JSON.stringify([
    collectImagePaths(layers),
    collectAssetKeys(layers),
    collectLayerFonts(layers).filter((font) => (WEB_FONTS as readonly string[]).includes(font)),
  ]);
  const needsAssets = key !== '[[],[],[]]';

  const [assets, setAssets] = useState<FrameAssets>();

  useEffect(() => {
    if (!needsAssets) return;
    let active = true;
    void prepareFrameAssets(layersRef.current, resolveUrl).then((loaded) => {
      if (active) setAssets(loaded);
    });
    return () => {
      active = false;
    };
  }, [key, needsAssets, resolveUrl]);

  return needsAssets ? assets : undefined;
}
