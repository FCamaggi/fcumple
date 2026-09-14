import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { usePhotoCapture } from '../hooks/usePhotoCapture';
import { useOrientation } from '../hooks/useOrientation';
import {
  getCameraControlsAvailability,
  type CameraControlsAvailability,
  type CameraTrackCapabilities,
  type CameraTrackConstraintSet,
} from '../lib/cameraControls';
import FilmRollCounter from './FilmRollCounter';
import type { PhotoQuota } from '../types';

interface CameraCaptureProps {
  token: string;
  quota: PhotoQuota;
  onQuotaChange?: (quota: PhotoQuota) => void;
  onClose: () => void;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
const NO_CONTROLS: CameraControlsAvailability = { zoom: null, torch: false };

/**
 * CameraCapture -- cámara dedicada del invitado, a pantalla completa
 * (docs/BACKLOG.md Etapa 8; reemplaza el bloque embebido de la Etapa 2).
 * Mismo patrón de overlay full-screen que QrScanner.tsx: se abre bajo
 * demanda desde GuestPage (no se monta automáticamente), con `onClose`
 * obligatorio. Dispara sobre un <canvas> oculto, redimensiona a un máximo
 * de MAX_DIMENSION px en el lado más largo y comprime a JPEG antes de
 * subir (ver docs/02-arquitectura/02-arquitectura-tecnica.md §8.3).
 *
 * El enfoque manual queda explícitamente fuera de alcance de esta etapa
 * (no hay una API web estable y ampliamente soportada para eso -- a
 * diferencia de zoom/torch, que sí son capabilities reales aunque no
 * estándar).
 *
 * Mismo criterio de testing que QrScanner.tsx: la lógica de "qué pasa con
 * un blob ya capturado" vive en usePhotoCapture (testable, ver su test),
 * y "qué controles mostrar dado un objeto de capabilities" vive en
 * lib/cameraControls.ts (testable sin un track real, ver su test). Lo que
 * sí se prueba de este componente en jsdom, ver CameraCapture.test.tsx.
 */
export default function CameraCapture({ token, quota, onQuotaChange, onClose }: CameraCaptureProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const orientation = useOrientation();
  const { state, capture, reset } = usePhotoCapture(token, quota, onQuotaChange);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [controls, setControls] = useState<CameraControlsAvailability>(NO_CONTROLS);
  const [zoom, setZoom] = useState<number | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  const remaining = Math.max(0, quota.quota - quota.used);
  const outOfShots = remaining <= 0;

  useEffect(() => {
    if (outOfShots) return; // no point opening the camera with nothing left to shoot
    let cancelled = false;
    let stream: MediaStream | null = null;

    // El track (y sus capabilities) son de la corrida anterior del efecto
    // -- limpiarlos ahora evita mostrar controles de zoom/torch de la
    // cámara vieja mientras arranca la nueva (ej. al tocar "Cambiar
    // cámara").
    setCameraReady(false);
    setControls(NO_CONTROLS);
    setZoom(null);
    setTorchOn(false);
    trackRef.current = null;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Este dispositivo o navegador no permite acceder a la cámara.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }

        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        // Safari no implementa getCapabilities() -- el optional chaining
        // es obligatorio acá, no una precaución de más.
        const caps = (track?.getCapabilities?.() ?? null) as CameraTrackCapabilities | null;
        const availability = getCameraControlsAvailability(caps);
        setControls(availability);
        if (availability.zoom) setZoom(availability.zoom.min);
      } catch {
        setCameraError('No pudimos acceder a la cámara. Revisá los permisos del navegador.');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      trackRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode, outOfShots]);

  async function handleZoomChange(value: number) {
    setZoom(value);
    const track = trackRef.current;
    if (!track) return;
    try {
      // La capability existía cuando se leyó getCapabilities(), pero el
      // navegador puede igual rechazar el constraint en runtime -- no hay
      // mejor recuperación que dejar el control como está. El cast hace
      // falta porque `zoom`/`torch` no están en los tipos DOM estándar de
      // MediaTrackConstraintSet (ver lib/cameraControls.ts).
      const constraints: CameraTrackConstraintSet = { zoom: value };
      await track.applyConstraints({ advanced: [constraints] } as MediaTrackConstraints);
    } catch {
      /* ver comentario de arriba */
    }
  }

  async function handleTorchToggle() {
    const next = !torchOn;
    setTorchOn(next);
    const track = trackRef.current;
    if (!track) return;
    try {
      const constraints: CameraTrackConstraintSet = { torch: next };
      await track.applyConstraints({ advanced: [constraints] } as MediaTrackConstraints);
    } catch {
      /* mismo criterio que handleZoomChange */
    }
  }

  function handleShoot() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) capture(blob);
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  }

  if (outOfShots) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-ink-950" aria-label="Cámara de fotos">
        <CameraHeader onClose={onClose} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="font-mono text-[11px] uppercase tracking-widest text-flame-500">Rollo terminado</span>
          <FilmRollCounter quota={quota.quota} used={quota.used} />
          <p className="font-sans text-sm text-paper-100/70">
            Se acabó tu rollo. Ya diste todos tus disparos para esta noche.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950" aria-label="Cámara de fotos">
      <CameraHeader onClose={onClose}>
        <button
          type="button"
          onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
          className="font-mono text-[10px] uppercase tracking-wider text-paper-100/70 underline underline-offset-4"
        >
          Cambiar cámara
        </button>
      </CameraHeader>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {cameraError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="font-mono text-[11px] uppercase tracking-widest text-flame-500">Cámara no disponible</span>
            <p className="font-sans text-sm text-paper-100/80">{cameraError}</p>
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden bg-ink-950">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no captionable content */}
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-hidden />
            <canvas ref={canvasRef} className="hidden" aria-hidden />
            <FramingGuide orientation={orientation} />
          </div>
        )}

        <div className="flex flex-col gap-3 bg-ink-900 p-3">
          <FilmRollCounter quota={quota.quota} used={quota.used} />

          {controls.zoom && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="camera-zoom"
                className="font-mono text-[10px] uppercase tracking-widest text-paper-100/70"
              >
                Zoom
              </label>
              <input
                id="camera-zoom"
                type="range"
                min={controls.zoom.min}
                max={controls.zoom.max}
                step={controls.zoom.step}
                value={zoom ?? controls.zoom.min}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="w-full accent-hotpink-500"
              />
            </div>
          )}

          {controls.torch && (
            <button
              type="button"
              onClick={handleTorchToggle}
              aria-pressed={torchOn}
              className={`tap-target self-start px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider ${
                torchOn ? 'bg-acid-400 text-ink-950 shadow-glow-acid' : 'bg-smoke-700/30 text-paper-100'
              }`}
            >
              Flash {torchOn ? 'activado' : 'apagado'}
            </button>
          )}

          <AnimatePresence mode="wait">
            {state.phase === 'success' ? (
              <ConfirmationBanner key="success" reduceMotion={reduceMotion} onDismiss={reset} />
            ) : state.phase === 'error' ? (
              <ErrorBanner key="error" message={state.message} onDismiss={reset} />
            ) : null}
          </AnimatePresence>

          <button
            type="button"
            disabled={!cameraReady || !!cameraError || state.phase === 'uploading'}
            onClick={handleShoot}
            className={`tap-target h-14 font-display text-lg uppercase tracking-wider transition-all active:scale-[0.98] ${
              !cameraReady || !!cameraError || state.phase === 'uploading'
                ? 'cursor-not-allowed bg-smoke-700/40 text-paper-100/70'
                : 'bg-hotpink-500 text-ink-950 shadow-glow-hotpink'
            }`}
          >
            {state.phase === 'uploading' ? 'Revelando el disparo...' : 'Disparar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CameraHeader({ onClose, children }: { onClose: () => void; children?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 bg-ink-900 px-4 py-3 shadow-lg">
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-hotpink-500">
        Cámara // modo carrete
      </span>
      <div className="flex items-center gap-3">
        {children}
        <button
          type="button"
          onClick={onClose}
          className="tap-target flex items-center justify-center bg-smoke-700/30 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 transition-colors hover:bg-smoke-700/50"
        >
          Cerrar
        </button>
      </div>
    </header>
  );
}

/**
 * Guías decorativas de encuadre -- puramente visuales (pointer-events-none,
 * aria-hidden), viven adentro del contenedor del <video> así que nunca
 * pueden tapar el botón de disparo ni los controles de zoom/torch, que son
 * un bloque hermano fuera de este contenedor. El aspecto del marco cambia
 * según la orientación real del dispositivo (useOrientation), no un
 * breakpoint fijo -- girar el teléfono con la cámara abierta reacomoda la
 * guía en vivo.
 */
function FramingGuide({ orientation }: { orientation: 'portrait' | 'landscape' }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6" aria-hidden>
      <div
        className={`relative border-2 border-acid-400/40 ${
          orientation === 'portrait' ? 'aspect-[3/4] h-4/5 max-h-full' : 'aspect-[4/3] w-4/5 max-w-full'
        }`}
      >
        <span className="absolute -left-px -top-px h-6 w-6 border-l-2 border-t-2 border-acid-400" />
        <span className="absolute -right-px -top-px h-6 w-6 border-r-2 border-t-2 border-acid-400" />
        <span className="absolute -bottom-px -left-px h-6 w-6 border-b-2 border-l-2 border-acid-400" />
        <span className="absolute -bottom-px -right-px h-6 w-6 border-b-2 border-r-2 border-acid-400" />
      </div>
    </div>
  );
}

function ConfirmationBanner({ reduceMotion, onDismiss }: { reduceMotion: boolean; onDismiss: () => void }) {
  return (
    <motion.div
      role="status"
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
      className="flex items-center justify-between gap-3 bg-acid-400/10 px-3 py-2"
    >
      <p className="font-sans text-sm text-acid-400">Quedó en el rollo. Pasa por moderación antes de revelarse.</p>
      <button type="button" onClick={onDismiss} className="font-mono text-[10px] uppercase text-paper-100/70">
        Ok
      </button>
    </motion.div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 bg-flame-500/10 px-3 py-2">
      <p className="font-sans text-sm text-flame-500">{message}</p>
      <button type="button" onClick={onDismiss} className="font-mono text-[10px] uppercase text-paper-100/70">
        Ok
      </button>
    </div>
  );
}
