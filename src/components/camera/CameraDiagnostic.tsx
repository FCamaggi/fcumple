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

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  trackRef: RefObject<MediaStreamTrack | null>;
  /** Proporción (ancho / alto) a la que hoy se recorta el video. */
  aspect: number;
}

const fmt = (n: number | undefined, d = 3) => (typeof n === 'number' ? n.toFixed(d) : '—');

export default function CameraDiagnostic({ videoRef, trackRef, aspect }: Props) {
  const [lines, setLines] = useState<string[]>([]);

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
        `track: ${s.width ?? '—'}×${s.height ?? '—'}  ar ${fmt(s.aspectRatio)}  zoom ${fmt(s.zoom, 2)}`,
        `facing: ${s.facingMode ?? '—'}  fps ${fmt(s.frameRate, 0)}`,
        `video: ${vw}×${vh}  ar ${vh ? fmt(vw / vh) : '—'}`,
        `visor (video): ${video?.clientWidth ?? 0}×${video?.clientHeight ?? 0}  ar ${video?.clientHeight ? fmt(video.clientWidth / video.clientHeight) : '—'}`,
        `recorte a ${fmt(aspect)}: ves ${(visibleW * 100).toFixed(0)}% ancho × ${(visibleH * 100).toFixed(0)}% alto`,
        `zoom aparente: ${fmt(zoom, 2)}×`,
        `window: ${window.innerWidth}×${window.innerHeight}  dpr ${window.devicePixelRatio}`,
        `visualViewport: ${vv ? `${Math.round(vv.width)}×${Math.round(vv.height)} y${Math.round(vv.offsetTop)} esc ${fmt(vv.scale, 2)}` : '—'}`,
        `orient: ${window.screen?.orientation?.type ?? '—'}`,
      ]);
    };
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, [videoRef, trackRef, aspect]);

  return (
    <pre
      aria-hidden
      className="pointer-events-none absolute left-1 top-1 z-50 max-w-[96%] whitespace-pre-wrap rounded bg-black/75 p-2 font-mono text-xs leading-tight text-lime-300"
    >
      {lines.join('\n')}
    </pre>
  );
}
