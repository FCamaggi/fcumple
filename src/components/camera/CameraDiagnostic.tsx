import { useEffect, useState, type RefObject } from 'react';
import { coverCrop } from '../../lib/cameraFraming';

/** Temporal: solo se monta con `?diagnostico=1`. Se borra cuando la captura sin zoom esté medida y resuelta. */
export function diagnosticoActivo(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('diagnostico') === '1';
  } catch {
    return false;
  }
}

/**
 * Para comparar en el teléfono qué video entrega el navegador según lo que se le pide (`&c=`):
 * `a` solo la cámara (como la Fase 0), `b` cámara y proporción, `c` cámara, proporción y tamaño ideal
 * (lo actual). Sin `c=` o sin diagnóstico devuelve `null` y se usa lo de siempre.
 */
export function restriccionesDeDiagnostico(
  facingMode: 'user' | 'environment',
  orientation: 'portrait' | 'landscape',
): MediaTrackConstraints | null {
  if (!diagnosticoActivo()) return null;
  const variante = new URLSearchParams(window.location.search).get('c');
  const ratio = orientation === 'portrait' ? 3 / 4 : 4 / 3;
  if (variante === 'a') return { facingMode };
  if (variante === 'b') return { facingMode, aspectRatio: { ideal: ratio } };
  return null;
}

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  trackRef: RefObject<MediaStreamTrack | null>;
  /** Proporción (ancho / alto) a la que hoy se recorta el video. */
  aspect: number;
  /** Qué intento de `openCameraStream` dio el video actual. */
  attemptRef?: RefObject<string | null>;
}

/** Copia al portapapeles; si el contexto no lo permite, cae a un textarea temporal. */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

const fmt = (n: number | undefined, d = 3) => (typeof n === 'number' ? n.toFixed(d) : '—');

export default function CameraDiagnostic({ videoRef, trackRef, aspect, attemptRef }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [copiado, setCopiado] = useState<boolean | null>(null);

  useEffect(() => {
    const read = () => {
      const video = videoRef.current;
      const track = trackRef.current;
      const s = (track?.getSettings?.() ?? {}) as MediaTrackSettings & { zoom?: number };
      const vw = video?.videoWidth ?? 0;
      const vh = video?.videoHeight ?? 0;
      const vv = window.visualViewport;
      const crop = vw && vh ? coverCrop(vw, vh, aspect) : null;
      const visibleW = crop ? crop.sw / vw : 0;
      const visibleH = crop ? crop.sh / vh : 0;
      const zoom = crop ? 1 / Math.min(visibleW, visibleH) : 0;
      setLines([
        `pedido: c=${new URLSearchParams(window.location.search).get('c') ?? 'actual'}`,
        `intento: ${attemptRef?.current ?? '—'}`,
        `track: ${s.width ?? '—'}×${s.height ?? '—'}  ar ${fmt(s.aspectRatio)}  zoom ${fmt(s.zoom, 2)}`,
        `facing: ${s.facingMode ?? '—'}  fps ${fmt(s.frameRate, 0)}`,
        `video: ${vw}×${vh}  ar ${vh ? fmt(vw / vh) : '—'}`,
        `visor (video): ${video?.clientWidth ?? 0}×${video?.clientHeight ?? 0}  ar ${video?.clientHeight ? fmt(video.clientWidth / video.clientHeight) : '—'}`,
        `recorte a ${fmt(aspect)}: ves ${(visibleW * 100).toFixed(0)}% ancho × ${(visibleH * 100).toFixed(0)}% alto`,
        `zoom aparente: ${fmt(zoom, 2)}×`,
        `window: ${window.innerWidth}×${window.innerHeight}  dpr ${window.devicePixelRatio}`,
        `visualViewport: ${vv ? `${Math.round(vv.width)}×${Math.round(vv.height)} y${Math.round(vv.offsetTop)} esc ${fmt(vv.scale, 2)}` : '—'}`,
        `orient: ${window.screen?.orientation?.type ?? '—'}`,
        `ua: ${navigator.userAgent}`,
      ]);
    };
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, [videoRef, trackRef, aspect, attemptRef]);

  return (
    <div className="absolute left-1 top-1 z-50 flex max-w-[96%] flex-col items-start gap-1">
      <pre
        aria-hidden
        className="pointer-events-none whitespace-pre-wrap rounded bg-black/75 p-2 font-mono text-xs leading-tight text-lime-300"
      >
        {lines.join('\n')}
      </pre>
      <button
        type="button"
        onClick={async () => {
          setCopiado(await copiar(lines.join('\n')));
          window.setTimeout(() => setCopiado(null), 2000);
        }}
        className="tap-target rounded bg-lime-300 px-3 font-mono text-xs font-bold uppercase text-black"
      >
        {copiado === null ? 'Copiar diagnóstico' : copiado ? 'Copiado' : 'No se pudo copiar'}
      </button>
    </div>
  );
}
