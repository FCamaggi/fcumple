import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion, type PanInfo } from 'framer-motion';
import { usePhotoCapture } from '../hooks/usePhotoCapture';
import { useOrientation } from '../hooks/useOrientation';
import {
  getCameraControlsAvailability,
  type CameraControlsAvailability,
  type CameraTrackCapabilities,
  type CameraTrackConstraintSet,
} from '../lib/cameraControls';
import { FRAME_IDS, FRAME_LABELS, drawFrame, getFrameIndexAfterSwipe, type FrameId } from '../lib/cameraFrames';
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
const NO_CONTROLS: CameraControlsAvailability = { torch: false };
// Distancia mínima de arrastre horizontal para contar como swipe de cambio
// de marco -- por debajo de esto es más probable que haya sido un tap o un
// scroll accidental que una intención real de cambiar de marco.
const SWIPE_THRESHOLD = 48;

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
 * diferencia del torch, que sí es una capability real aunque no estándar).
 *
 * Etapa 9, Frente 1 (docs/BACKLOG.md) sumó tres cosas sobre esa base:
 *  1. Espejo real en cámara frontal (`facingMode: 'user'`), tanto en el
 *     preview (`<video>` con `scaleX(-1)` vía CSS) como en la foto final
 *     (mismo `scaleX(-1)` aplicado al compositar sobre el `<canvas>` antes
 *     de `toBlob`, ver `handleShoot`) -- el usuario prefirió "igual a lo
 *     que vio al sacarla" por sobre la convención fotográfica de guardar
 *     sin espejar.
 *  2. Disparador circular + ícono de flip (SVGs inline hechos a mano --
 *     primer uso de este patrón en el proyecto, no hay ninguna librería de
 *     íconos entre las dependencias).
 *  3. Marcos aplicables a la foto (`lib/cameraFrames.ts`), navegables con
 *     swipe horizontal sobre el preview (más botones ‹/› como fallback
 *     accesible, mismo criterio que el fallback de teclado/tap de
 *     FaderToggle.tsx y el input manual de QrScanner.tsx). La selección
 *     vive en el estado de este componente, así que se resetea sola cada
 *     vez que se desmonta y se vuelve a montar (cerrar/reabrir la cámara).
 *
 * Etapa 11 (QA del usuario tras probar en un celular real) ajustó dos
 * cosas más:
 *  4. Se sacó el control de zoom por completo (`getZoomPresets`/
 *     `ZoomChips`/el campo `zoom` de `CameraControlsAvailability`): lo que
 *     el navegador expone como "zoom" es zoom digital de la lente activa,
 *     no una selección de lentes físicas, y la mayoría de los dispositivos
 *     no reporta nada por debajo de 1x -- ver docs/04-producto/BACKLOG.md,
 *     Etapa 11, punto 3. El torch/flash no se tocó, sigue condicional a
 *     `capabilities.torch`.
 *  5. Pantalla de revisión antes de subir: `handleShoot` sigue componiendo
 *     el frame igual que antes, pero en vez de llamar a `capture(blob)`
 *     directo, guarda el blob y una URL de objeto (`reviewBlob`/
 *     `reviewUrl`) y muestra una pantalla "Repetir/Enviar" a pantalla
 *     completa sobre el preview en vivo (que sigue corriendo de fondo, no
 *     se pausa ni se reinicia). Sólo "Enviar" llama a `capture`, que es lo
 *     único que de verdad gasta un disparo del rollo (ver `usePhotoCapture`
 *     -> `uploadPhoto` -> `submit_photo`); "Repetir" descarta el blob y
 *     revoca la URL de objeto sin gastar nada.
 *
 * Mismo criterio de testing que QrScanner.tsx: la lógica de "qué pasa con
 * un blob ya capturado" vive en usePhotoCapture (testable, ver su test),
 * "qué controles mostrar dado un objeto de capabilities" vive en
 * lib/cameraControls.ts (testable sin un track real), y la navegación entre
 * marcos + las rutinas de dibujo viven en lib/cameraFrames.ts (testable con
 * un CanvasRenderingContext2D mockeado, ver su test). Lo que sí se prueba
 * de este componente en jsdom, ver CameraCapture.test.tsx -- el compositado
 * real del espejo y de un marco sobre píxeles reales de video no es
 * testable en jsdom (no hay cámara ni pipeline de <canvas> real), igual que
 * el resto de la captura. `URL.createObjectURL`/`revokeObjectURL` sí están
 * en jsdom, así que el flujo Repetir/Enviar sobre un blob mockeado se
 * prueba de punta a punta.
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
  const [torchOn, setTorchOn] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const frameId = FRAME_IDS[frameIndex];
  // Foto recién sacada, pendiente de "Repetir"/"Enviar" (Etapa 11, punto 4)
  // -- `capture(blob)` (la única llamada que de verdad sube y gasta un
  // disparo del rollo) sólo se dispara desde "Enviar", ver handleSend.
  const [reviewBlob, setReviewBlob] = useState<Blob | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  // Revoca la URL de objeto de la revisión anterior (o de la actual, al
  // desmontar con una revisión pendiente) para no filtrar memoria. Corre en
  // cada cambio de reviewUrl, no sólo al desmontar: cuando handleRetake/
  // handleSend la ponen en null, este cleanup revoca la URL que quedó
  // colgada del cierre anterior del efecto.
  useEffect(() => {
    return () => {
      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    };
  }, [reviewUrl]);

  const remaining = Math.max(0, quota.quota - quota.used);
  const outOfShots = remaining <= 0;

  useEffect(() => {
    if (outOfShots) return; // no point opening the camera with nothing left to shoot
    let cancelled = false;
    let stream: MediaStream | null = null;

    // El track (y sus capabilities) son de la corrida anterior del efecto
    // -- limpiarlos ahora evita mostrar el control de torch de la cámara
    // vieja mientras arranca la nueva (ej. al tocar "Cambiar cámara").
    setCameraReady(false);
    setControls(NO_CONTROLS);
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
        setControls(getCameraControlsAvailability(caps));
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

  async function handleTorchToggle() {
    const next = !torchOn;
    setTorchOn(next);
    const track = trackRef.current;
    if (!track) return;
    try {
      // La capability existía cuando se leyó getCapabilities(), pero el
      // navegador puede igual rechazar el constraint en runtime -- no hay
      // mejor recuperación que dejar el control como está. El cast hace
      // falta porque `torch` no está en los tipos DOM estándar de
      // MediaTrackConstraintSet (ver lib/cameraControls.ts).
      const constraints: CameraTrackConstraintSet = { torch: next };
      await track.applyConstraints({ advanced: [constraints] } as MediaTrackConstraints);
    } catch {
      /* ver comentario de arriba */
    }
  }

  function handleSwipeFrame(direction: 'left' | 'right') {
    setFrameIndex((i) => getFrameIndexAfterSwipe(i, direction, FRAME_IDS.length));
  }

  function handlePanEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (Math.abs(info.offset.x) < SWIPE_THRESHOLD) return;
    handleSwipeFrame(info.offset.x < 0 ? 'left' : 'right');
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

    // El espejo del preview frontal tiene que quedar grabado en la foto
    // final (decisión del usuario: "igual a lo que vio al sacarla"), pero
    // SOLO en los píxeles de la cámara -- el marco de encima se dibuja
    // después, ya restaurada la transformación, para que texto/formas
    // queden derechos en vez de espejados.
    ctx.save();
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    drawFrame(ctx, frameId, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        // No sube todavía -- sólo guarda el blob y su URL de objeto para
        // la pantalla de revisión (Etapa 11, punto 4). `capture(blob)`
        // recién se llama desde handleSend.
        setReviewBlob(blob);
        setReviewUrl(URL.createObjectURL(blob));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  }

  function handleRetake() {
    setReviewBlob(null);
    setReviewUrl(null);
  }

  function handleSend() {
    if (!reviewBlob) return;
    capture(reviewBlob);
    setReviewBlob(null);
    setReviewUrl(null);
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
          aria-label="Cambiar cámara"
          className="tap-target flex items-center justify-center text-paper-100/80 transition-colors hover:text-paper-100"
        >
          <FlipCameraIcon />
        </button>
      </CameraHeader>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {cameraError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="font-mono text-[11px] uppercase tracking-widest text-flame-500">Cámara no disponible</span>
            <p className="font-sans text-sm text-paper-100/80">{cameraError}</p>
          </div>
        ) : (
          <motion.div
            className="relative flex-1 touch-pan-y overflow-hidden bg-ink-950"
            onPanEnd={handlePanEnd}
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no captionable content */}
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
              muted
              playsInline
              aria-hidden
            />
            <canvas ref={canvasRef} className="hidden" aria-hidden />
            <FramingGuide orientation={orientation} />
            <FrameOverlay frameId={frameId} />
          </motion.div>
        )}

        <div className="flex flex-col gap-2 bg-ink-900 p-2.5">
          <div className="flex items-center gap-2">
            <FilmRollCounter quota={quota.quota} used={quota.used} />

            <div className="flex flex-1 flex-col gap-1.5">
              {controls.torch && (
                <button
                  type="button"
                  onClick={handleTorchToggle}
                  aria-pressed={torchOn}
                  className={`tap-target self-start px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                    torchOn ? 'bg-acid-400 text-ink-950 shadow-glow-acid' : 'bg-smoke-700/30 text-paper-100'
                  }`}
                >
                  Flash {torchOn ? 'activado' : 'apagado'}
                </button>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {state.phase === 'success' ? (
              <ConfirmationBanner key="success" reduceMotion={reduceMotion} onDismiss={reset} />
            ) : state.phase === 'error' ? (
              <ErrorBanner key="error" message={state.message} onDismiss={reset} />
            ) : null}
          </AnimatePresence>

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => handleSwipeFrame('right')}
              aria-label="Marco anterior"
              className="tap-target flex items-center justify-center text-paper-100/60 transition-colors hover:text-paper-100"
            >
              <ChevronIcon direction="left" />
            </button>

            <ShutterButton
              disabled={!cameraReady || !!cameraError || state.phase === 'uploading' || !!reviewUrl}
              uploading={state.phase === 'uploading'}
              onClick={handleShoot}
            />

            <button
              type="button"
              onClick={() => handleSwipeFrame('left')}
              aria-label="Siguiente marco"
              className="tap-target flex items-center justify-center text-paper-100/60 transition-colors hover:text-paper-100"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>
          <span className="text-center font-mono text-[10px] uppercase tracking-widest text-paper-100/60">
            Marco // {FRAME_LABELS[frameId]}
          </span>
        </div>
      </div>

      {reviewUrl && (
        <ReviewScreen photoUrl={reviewUrl} onRetake={handleRetake} onSend={handleSend} />
      )}
    </div>
  );
}

/**
 * Pantalla de revisión (Etapa 11, punto 4) -- se superpone al preview en
 * vivo, que sigue corriendo de fondo debajo (no se desmonta el <video>,
 * así que no hace falta volver a pedir getUserMedia al tocar "Repetir").
 */
function ReviewScreen({
  photoUrl,
  onRetake,
  onSend,
}: {
  photoUrl: string;
  onRetake: () => void;
  onSend: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink-950" aria-label="Revisión de la foto">
      <div className="relative flex-1 overflow-hidden bg-ink-950">
        <img src={photoUrl} alt="Foto recién sacada, todavía sin enviar" className="h-full w-full object-contain" />
      </div>
      <div className="flex items-center justify-center gap-3 bg-ink-900 p-3">
        <button
          type="button"
          onClick={onRetake}
          className="tap-target flex-1 bg-smoke-700/30 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 transition-colors hover:bg-smoke-700/50"
        >
          Repetir
        </button>
        <button
          type="button"
          onClick={onSend}
          className="tap-target flex-1 bg-hotpink-500 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950 shadow-glow-hotpink transition-colors"
        >
          Enviar
        </button>
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
 * Disparador circular hecho a mano en SVG -- el proyecto no tiene ninguna
 * librería de íconos entre sus dependencias (solo framer-motion, ver
 * package.json), así que agregar una sola para dos glifos habría sido
 * desproporcionado. Mismo criterio para FlipCameraIcon/ChevronIcon.
 */
function ShutterButton({
  disabled,
  uploading,
  onClick,
}: {
  disabled: boolean;
  uploading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={uploading ? 'Revelando el disparo' : 'Disparar'}
      className={`tap-target flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 transition-all active:scale-95 ${
        disabled
          ? 'cursor-not-allowed border-smoke-700/40'
          : 'border-paper-100 shadow-glow-hotpink'
      }`}
    >
      <span
        className={`h-12 w-12 rounded-full transition-colors ${
          disabled ? 'bg-smoke-700/40' : uploading ? 'animate-pulse bg-hotpink-500/60' : 'bg-hotpink-500'
        }`}
      />
    </button>
  );
}

function FlipCameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7a8 8 0 0 1 13.5-3.5L19 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 2v4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M20 17a8 8 0 0 1-13.5 3.5L5 19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 22v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Guías decorativas de encuadre -- puramente visuales (pointer-events-none,
 * aria-hidden), viven adentro del contenedor del <video> así que nunca
 * pueden tapar el botón de disparo ni el control de torch, que son un
 * bloque hermano fuera de este contenedor. El aspecto del marco cambia
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

/**
 * Capa de preview en vivo de los marcos -- DOM/CSS por rendimiento (no un
 * <canvas> de preview), superpuesta al <video> igual que FramingGuide. Debe
 * mantenerse equivalente a mano a las rutinas reales de
 * lib/cameraFrames.ts, que son las que de verdad quedan grabadas en el
 * JPEG -- ver el comentario de cabecera de ese archivo.
 */
function FrameOverlay({ frameId }: { frameId: FrameId }) {
  if (frameId === 'none') return null;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {frameId === 'neon-corners' && (
        <>
          <span className="absolute left-3 top-3 h-10 w-10 border-l-4 border-t-4 border-hotpink-500 shadow-glow-hotpink" />
          <span className="absolute right-3 top-3 h-10 w-10 border-r-4 border-t-4 border-hotpink-500 shadow-glow-hotpink" />
          <span className="absolute bottom-3 left-3 h-10 w-10 border-b-4 border-l-4 border-hotpink-500 shadow-glow-hotpink" />
          <span className="absolute bottom-3 right-3 h-10 w-10 border-b-4 border-r-4 border-hotpink-500 shadow-glow-hotpink" />
        </>
      )}

      {frameId === 'roll-ticket' && (
        <div className="absolute inset-x-0 bottom-0 flex h-[10%] items-center justify-center bg-ink-950/85">
          <span className="font-mono text-xs uppercase tracking-widest text-paper-100">FCUMPLE // 09.10.26</span>
        </div>
      )}

      {frameId === 'polaroid' && (
        <div className="absolute inset-0 border-[3vw] border-b-[10vw] border-paper-100" />
      )}

      {frameId === 'laser-grid' && (
        <>
          <span className="absolute left-0 top-[6%] h-px w-12 bg-laser-500" />
          <span className="absolute left-0 top-[9%] h-px w-12 bg-laser-500" />
          <span className="absolute left-0 top-[12%] h-px w-12 bg-laser-500" />
          <span className="absolute right-0 top-[6%] h-px w-12 bg-laser-500" />
          <span className="absolute right-0 top-[9%] h-px w-12 bg-laser-500" />
          <span className="absolute right-0 top-[12%] h-px w-12 bg-laser-500" />
          <span className="absolute bottom-[6%] left-0 h-px w-12 bg-laser-500" />
          <span className="absolute bottom-[9%] left-0 h-px w-12 bg-laser-500" />
          <span className="absolute bottom-[12%] left-0 h-px w-12 bg-laser-500" />
          <span className="absolute bottom-[6%] right-0 h-px w-12 bg-laser-500" />
          <span className="absolute bottom-[9%] right-0 h-px w-12 bg-laser-500" />
          <span className="absolute bottom-[12%] right-0 h-px w-12 bg-laser-500" />
        </>
      )}

      {frameId === 'confetti' && (
        <>
          <span className="absolute left-[4%] top-[6%] h-2.5 w-2.5 rounded-full bg-hotpink-500" />
          <span className="absolute left-[9%] top-[3%] h-2.5 w-2.5 bg-acid-400" />
          <span className="absolute left-[3%] top-[12%] h-2.5 w-2.5 bg-laser-500" />
          <span className="absolute right-[4%] top-[5%] h-2.5 w-2.5 rounded-full bg-flame-500" />
          <span className="absolute right-[9%] top-[9%] h-2.5 w-2.5 bg-hotpink-500" />
          <span className="absolute right-[3%] top-[14%] h-2.5 w-2.5 rounded-full bg-acid-400" />
          <span className="absolute bottom-[8%] left-[5%] h-2.5 w-2.5 rounded-full bg-laser-500" />
          <span className="absolute bottom-[4%] left-[10%] h-2.5 w-2.5 bg-flame-500" />
          <span className="absolute bottom-[6%] right-[6%] h-2.5 w-2.5 bg-hotpink-500" />
          <span className="absolute bottom-[10%] right-[10%] h-2.5 w-2.5 rounded-full bg-acid-400" />
        </>
      )}

      {frameId === 'vinyl' && (
        <div className="absolute bottom-0 right-0 h-1/3 w-1/3 overflow-hidden">
          <div className="absolute -bottom-1/2 -right-1/2 h-full w-full rounded-full border-8 border-acid-400/70 bg-ink-950/50" />
        </div>
      )}

      {frameId === 'typographic' && (
        <span className="absolute bottom-3 left-3 font-display text-lg uppercase tracking-wide text-paper-100">
          Fabrizio // 26
        </span>
      )}
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
