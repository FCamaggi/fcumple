/**
 * Apertura de la cámara con la orientación correcta. Safari de iPhone, al pedirle `width`/`height`/
 * `aspectRatio`, entrega el video girado respecto de lo pedido (pedimos 3:4 vertical y llega 4:3): el
 * visor lo recortaba y se veía con zoom. Pedir solo `facingMode` sí llega derecho, pero a 640 px. Aquí se
 * pide lo ideal, se comprueba lo que llegó y, si viene girado, se reintenta con las medidas giradas y, en
 * último caso, con la cámara sola. Nunca se recorta en silencio para tapar el error.
 */

export type CameraOrientation = 'portrait' | 'landscape';
export type CameraFacing = 'user' | 'environment';

const LONG_SIDE = 2048;
const SHORT_SIDE = 1536;

/** Lo ideal para la orientación del teléfono: 3:4 en vertical, 4:3 en horizontal. */
export function idealVideoConstraints(facingMode: CameraFacing, orientation: CameraOrientation): MediaTrackConstraints {
  const portrait = orientation === 'portrait';
  return {
    facingMode,
    width: { ideal: portrait ? SHORT_SIDE : LONG_SIDE },
    height: { ideal: portrait ? LONG_SIDE : SHORT_SIDE },
    aspectRatio: { ideal: portrait ? 3 / 4 : 4 / 3 },
  };
}

/** ¿El video que llegó tiene la orientación pedida? Si el navegador no informa medidas, se da por bueno. */
export function streamMatchesOrientation(stream: MediaStream, orientation: CameraOrientation): boolean {
  const settings = stream.getVideoTracks()[0]?.getSettings?.();
  const w = settings?.width;
  const h = settings?.height;
  if (!w || !h || w === h) return true;
  return (w > h) === (orientation === 'landscape');
}

export interface OpenedCamera {
  stream: MediaStream;
  /** Qué intento dio el video: `ideal`, `girado` (medidas giradas) o `basico` (solo la cámara). */
  attempt: 'ideal' | 'girado' | 'basico';
}

/**
 * Abre la cámara. `first` permite al diagnóstico forzar el primer pedido. Si el flujo llega con la
 * orientación contraria, lo cierra y prueba lo siguiente; si ningún intento calza se queda con el último
 * (el básico), que es el que entrega el navegador sin que se le pida nada.
 */
export async function openCameraStream(
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>,
  facingMode: CameraFacing,
  orientation: CameraOrientation,
  first?: MediaTrackConstraints | null,
): Promise<OpenedCamera> {
  const opposite: CameraOrientation = orientation === 'portrait' ? 'landscape' : 'portrait';
  const attempts: Array<[OpenedCamera['attempt'], MediaTrackConstraints]> = [
    ['ideal', first ?? idealVideoConstraints(facingMode, orientation)],
    ['girado', idealVideoConstraints(facingMode, opposite)],
    ['basico', { facingMode }],
  ];
  let last: OpenedCamera | null = null;
  for (const [attempt, video] of attempts) {
    const stream = await getUserMedia({ video });
    last = { stream, attempt };
    if (streamMatchesOrientation(stream, orientation)) return last;
    if (attempt !== 'basico') stream.getTracks().forEach((t) => t.stop());
  }
  return last as OpenedCamera;
}
