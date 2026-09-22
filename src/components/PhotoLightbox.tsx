import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, type PanInfo } from 'framer-motion';
import { getSignedPhotoDownloadUrl, getSignedPhotoUrl } from '../lib/photosApi';

export interface LightboxPhoto {
  storagePath: string;
  createdAt: string;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  startIndex: number;
  onClose: () => void;
}

// Distancia mínima de swipe horizontal (px) para contar como "cambiar de
// foto" en vez de un roce accidental.
const SWIPE_THRESHOLD = 50;

/**
 * PhotoLightbox — carrusel fullscreen para el rollo revelado (RevealedRoll),
 * reemplaza el expandir-en-línea de bandas grandes (feedback de QA manual:
 * el usuario quería ver una foto a la vez, no un grid que crece). Sigue el
 * mismo patrón de overlay fixed + backdrop click que los modales del admin
 * (GuestEditModal.tsx) -- no hay librería de portal/modal en este repo, así
 * que no se introduce una.
 *
 * Resuelve `getSignedPhotoUrl` de a una foto por vez (la actual + vecinos
 * inmediatos para navegación más fluida), nunca todo el rollo de una -- el
 * array de props es liviano (paths + timestamps), pero las URLs firmadas se
 * piden bajo demanda igual que en el resto de RevealedRoll.
 */
// Selector de elementos enfocables dentro del diálogo, para el focus trap.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function PhotoLightbox({ photos, startIndex, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Elemento que tenía el foco antes de abrir el visor (el thumbnail o botón
  // "Ver las N fotos" que lo disparó) -- se le devuelve el foco al cerrar
  // (Escape, click en backdrop o botón Cerrar comparten el mismo cleanup acá).
  const triggerElementRef = useRef<HTMLElement | null>(null);
  // Cache de promesas de signed URL por storagePath, para no volver a pedir
  // una URL ya resuelta (o en curso) en navegación rápida ida y vuelta
  // (0 -> 1 -> 0), ver `resolveUrl` más abajo.
  const urlCacheRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const reduceMotion = useReducedMotion() ?? false;

  const total = photos.length;
  const current = photos[index];

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % total) + total) % total);
    },
    [total],
  );

  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);

  const resolveUrl = useCallback((storagePath: string): Promise<string | null> => {
    const cache = urlCacheRef.current;
    const cached = cache.get(storagePath);
    if (cached) return cached;
    const promise = getSignedPhotoUrl(storagePath).catch(() => null);
    cache.set(storagePath, promise);
    return promise;
  }, []);

  // Foco inicial en el diálogo para que Escape / navegación por teclado
  // funcionen de inmediato, sin que el usuario tenga que tocar la pantalla
  // primero. Guarda el elemento disparador y le devuelve el foco al
  // desmontar (cierre por cualquier vía).
  useEffect(() => {
    triggerElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      triggerElementRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    function getFocusableElements(): HTMLElement[] {
      const dialog = dialogRef.current;
      if (!dialog) return [];
      return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'Tab') {
        // Focus trap: aria-modal="true" solo es verdad si Tab/Shift+Tab no
        // puede escapar al contenido de la página detrás del overlay fixed
        // (que sigue en el DOM y sería tabulable si no hiciéramos esto).
        const focusable = getFocusableElements();
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const dialog = dialogRef.current;
        const activeElement = document.activeElement;
        const activeInsideDialog = dialog?.contains(activeElement) ?? false;

        if (event.shiftKey) {
          if (!activeInsideDialog || activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (!activeInsideDialog || activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goPrev, goNext]);

  // Resuelve la foto actual y sus vecinos inmediatos (no todo el rollo) para
  // que ir a la siguiente/anterior se sienta instantáneo la mayoría de las
  // veces sin precalcular URLs que quizás nunca se vean.
  useEffect(() => {
    let active = true;
    const neighborIndexes = total <= 1 ? [index] : [index, (index + 1) % total, (index - 1 + total) % total];
    const toResolve = [...new Set(neighborIndexes)]
      .map((i) => photos[i])
      .filter((photo) => !urls[photo.storagePath]);

    if (toResolve.length === 0) return;

    Promise.all(
      toResolve.map(async (photo) => {
        const url = await resolveUrl(photo.storagePath);
        return [photo.storagePath, url] as const;
      }),
    ).then((entries) => {
      if (!active) return;
      setUrls((prev) => ({
        ...prev,
        ...Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== null)),
      }));
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total, resolveUrl]);

  async function handleDownload() {
    if (!current) return;
    setDownloading(true);
    const downloadUrl = await getSignedPhotoDownloadUrl(current.storagePath).catch(() => null);
    setDownloading(false);
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleDragEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (info.offset.x <= -SWIPE_THRESHOLD) {
      goNext();
    } else if (info.offset.x >= SWIPE_THRESHOLD) {
      goPrev();
    }
  }

  if (!current) return null;
  const currentUrl = urls[current.storagePath];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/95 p-4"
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Foto ${index + 1} de ${total}`}
        tabIndex={-1}
        initial={reduceMotion ? undefined : { opacity: 0 }}
        animate={reduceMotion ? undefined : { opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.15 }}
        className="relative flex h-full w-full max-w-3xl flex-col items-center justify-center gap-3 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between font-mono text-[11px] uppercase tracking-widest text-paper-100/70">
          <span>
            {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor de fotos"
            className="tap-target border border-smoke-700/50 px-3 py-1 text-flame-500 transition-colors hover:bg-flame-500/10"
          >
            Cerrar
          </button>
        </div>

        <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden">
          {total > 1 && (
            <button
              type="button"
              onClick={goPrev}
              aria-label="Foto anterior"
              className="tap-target absolute left-0 z-10 flex h-12 w-12 items-center justify-center bg-ink-950/80 font-display text-2xl text-acid-400"
            >
              ‹
            </button>
          )}
          {currentUrl ? (
            <motion.img
              key={current.storagePath}
              src={currentUrl}
              alt=""
              drag={total > 1 ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className="max-h-full max-w-full touch-none select-none object-contain"
            />
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-widest text-paper-100/50">Cargando…</span>
          )}
          {total > 1 && (
            <button
              type="button"
              onClick={goNext}
              aria-label="Foto siguiente"
              className="tap-target absolute right-0 z-10 flex h-12 w-12 items-center justify-center bg-ink-950/80 font-display text-2xl text-acid-400"
            >
              ›
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="tap-target border border-acid-400 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-acid-400 shadow-glow-acid transition-transform active:scale-95 disabled:opacity-50"
        >
          {downloading ? 'Generando…' : 'Descargar'}
        </button>
      </motion.div>
    </div>
  );
}
