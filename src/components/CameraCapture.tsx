import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { usePhotoCapture } from '../hooks/usePhotoCapture';
import FilmRollCounter from './FilmRollCounter';
import type { PhotoQuota } from '../types';

interface CameraCaptureProps {
  token: string;
  quota: PhotoQuota;
  onQuotaChange?: (quota: PhotoQuota) => void;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

/**
 * CameraCapture -- modo cámara del invitado (DESIGN.md §7.9,
 * docs/BACKLOG.md Etapa 2). Abre getUserMedia, dispara sobre un <canvas>
 * oculto, redimensiona a un máximo de MAX_DIMENSION px en el lado más
 * largo y comprime a JPEG antes de subir (para no comerse la cuota de
 * Storage del free tier con fotos de alta resolución, ver
 * docs/02-arquitectura-tecnica.md §8.3).
 *
 * Mismo criterio de testing que QrScanner.tsx (Etapa 3, ya mergeado en
 * main): la lógica de "qué pasa con un blob ya capturado" vive en
 * usePhotoCapture (testable, ver su test), y este componente separa esa
 * lógica del loop de cámara real. Lo único de este archivo que se prueba
 * en jsdom es el fallback cuando `navigator.mediaDevices` no existe y el
 * render de los estados de subida/confirmación/error a partir de un
 * `state` inyectado -- abrir una cámara real, pintar un <video> real y
 * leer píxeles reales de un <canvas> no es algo que jsdom pueda simular
 * de forma significativa, y fingir que sí sería un test que miente.
 */
export default function CameraCapture({ token, quota, onQuotaChange }: CameraCaptureProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const { state, capture, reset } = usePhotoCapture(token, quota, onQuotaChange);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const remaining = Math.max(0, quota.quota - quota.used);
  const outOfShots = remaining <= 0;

  useEffect(() => {
    if (outOfShots) return; // no point opening the camera with nothing left to shoot
    let cancelled = false;
    let stream: MediaStream | null = null;

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
      } catch {
        setCameraError('No pudimos acceder a la cámara. Revisá los permisos del navegador.');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode, outOfShots]);

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
      <section className="flex flex-col gap-3 bg-ink-900 p-4 shadow-2xl" aria-label="Cámara">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-hotpink-500">
          Cámara // modo carrete
        </span>
        <FilmRollCounter quota={quota.quota} used={quota.used} />
        <p className="font-sans text-sm text-paper-100/70">
          Se acabó tu rollo. Ya diste todos tus disparos para esta noche.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 bg-ink-900 p-4 shadow-2xl" aria-label="Cámara">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-hotpink-500">
          Cámara // modo carrete
        </span>
        <button
          type="button"
          onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
          className="font-mono text-[10px] uppercase tracking-wider text-paper-100/70 underline underline-offset-4"
        >
          Cambiar cámara
        </button>
      </div>

      <FilmRollCounter quota={quota.quota} used={quota.used} />

      {cameraError ? (
        <div className="flex flex-col items-center gap-2 bg-ink-950 p-6 text-center">
          <span className="font-mono text-[11px] uppercase tracking-widest text-flame-500">Cámara no disponible</span>
          <p className="font-sans text-sm text-paper-100/80">{cameraError}</p>
        </div>
      ) : (
        <div className="relative overflow-hidden bg-ink-950">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no captionable content */}
          <video ref={videoRef} className="aspect-[3/4] w-full object-cover" muted playsInline aria-hidden />
          <canvas ref={canvasRef} className="hidden" aria-hidden />
        </div>
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
    </section>
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
