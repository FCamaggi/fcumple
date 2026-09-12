import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQrCheckIn, type QrCheckInState } from '../hooks/useQrCheckIn';
import type { Guest, RsvpStatus } from '../types';

interface QrScannerProps {
  guests: Guest[];
  onCheckedIn?: (guest: Guest) => void;
  onClose?: () => void;
}

const STATUS_ACCENT: Record<RsvpStatus, { text: string; glow: string; label: string }> = {
  confirmed: { text: 'text-acid-400', glow: 'shadow-glow-acid', label: 'Confirmado' },
  declined: { text: 'text-flame-500', glow: 'shadow-glow-flame', label: 'Rechazado' },
  pending: { text: 'text-laser-500', glow: 'shadow-glow-laser', label: 'Pendiente' },
};

/**
 * QrScanner — modo "Escáner" de /admin (Etapa 3 del backlog). Abre la
 * cámara trasera del dispositivo, decodifica QR en un loop de
 * requestAnimationFrame vía jsQR sobre un <canvas> oculto, y al reconocer un
 * token dispara check_in_guest a través de useQrCheckIn.
 *
 * La lógica de "qué hacer con un token detectado" vive enteramente en
 * useQrCheckIn (testable sin cámara real) -- este componente es sólo el
 * loop de cámara/canvas (no testable en jsdom, ver src/hooks/useQrCheckIn.ts
 * y el test de este archivo para el detalle de qué sí/no está cubierto).
 */
export default function QrScanner({ guests, onCheckedIn, onClose }: QrScannerProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const { state, handleDetected, reset } = useQrCheckIn(guests);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Kept as a ref so the rAF loop (set up once) always calls the latest
  // handleDetected, even though its identity changes whenever `guests`
  // changes -- restarting the whole camera stream on every guest-list
  // update would be wasteful and would drop frames.
  const handleDetectedRef = useRef(handleDetected);
  useEffect(() => {
    handleDetectedRef.current = handleDetected;
  }, [handleDetected]);

  const notifiedGuestIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase === 'success' && notifiedGuestIdRef.current !== state.guest.id) {
      notifiedGuestIdRef.current = state.guest.id;
      onCheckedIn?.(state.guest);
    }
    if (state.phase === 'idle') {
      notifiedGuestIdRef.current = null;
    }
  }, [state, onCheckedIn]);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    let stream: MediaStream | null = null;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext('2d');
        if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            handleDetectedRef.current(code.data);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Este dispositivo o navegador no permite acceder a la cámara.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        rafId = requestAnimationFrame(tick);
      } catch {
        setCameraError('No pudimos acceder a la cámara. Revisá los permisos del navegador o probá desde el celular.');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink-950"
      aria-label="Escáner QR de puerta"
    >
      <header className="flex items-center justify-between bg-ink-900 px-4 py-3 shadow-lg">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-hotpink-500">
          Escáner // check-in de puerta
        </span>
        <button
          type="button"
          onClick={onClose}
          className="tap-target flex items-center justify-center bg-smoke-700/30 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 transition-colors hover:bg-smoke-700/50"
        >
          Cerrar
        </button>
      </header>

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
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="aspect-square w-2/3 max-w-xs border-2 border-acid-400/70 shadow-glow-acid" aria-hidden />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {state.phase === 'success' && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-950/95 p-4">
              <CheckInOverlay key={state.guest.id} state={state} reduceMotion={reduceMotion} onReset={reset} />
            </div>
          )}
          {state.phase === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-950/95 p-4">
              <ErrorOverlay key="error" message={state.message} onReset={reset} />
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function CheckInOverlay({
  state,
  reduceMotion,
  onReset,
}: {
  state: Extract<QrCheckInState, { phase: 'success' }>;
  reduceMotion: boolean;
  onReset: () => void;
}) {
  const accent = STATUS_ACCENT[state.guest.status];
  const alreadyArrived = state.previousCheckedInAt !== null;

  return (
    <motion.div
      role="status"
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: [0.2, 1, 0.3, 1, 1] }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.9, times: [0, 0.3, 0.5, 0.7, 1] }}
      exit={{ opacity: 0 }}
      className={`flex flex-col items-center gap-3 bg-ink-950 p-6 text-center ${accent.glow}`}
    >
      <span className={`font-mono text-[11px] uppercase tracking-widest ${accent.text}`}>{accent.label}</span>
      <h2 className="font-display text-3xl uppercase leading-none text-paper-100">{state.guest.fullName}</h2>
      {alreadyArrived ? (
        <p className="font-sans text-sm text-paper-100/80">
          Ya había llegado a las {formatTime(state.previousCheckedInAt)}
        </p>
      ) : (
        <p className="font-sans text-sm uppercase tracking-wide text-hotpink-500">Bienvenido a la puerta</p>
      )}
      <button
        type="button"
        onClick={onReset}
        className="tap-target mt-2 bg-acid-400 px-6 py-2 font-mono text-xs font-bold uppercase tracking-wider text-ink-950 shadow-glow-acid transition-transform active:scale-95"
      >
        Escanear otro
      </button>
    </motion.div>
  );
}

function ErrorOverlay({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 bg-ink-950 p-6 text-center">
      <span className="font-mono text-[11px] uppercase tracking-widest text-flame-500">No pudimos verificar</span>
      <p className="font-sans text-sm text-paper-100/80">{message}</p>
      <button
        type="button"
        onClick={onReset}
        className="tap-target mt-2 bg-smoke-700/30 px-6 py-2 font-mono text-xs font-bold uppercase tracking-wider text-paper-100 transition-colors hover:bg-smoke-700/50"
      >
        Seguir escaneando
      </button>
    </div>
  );
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
