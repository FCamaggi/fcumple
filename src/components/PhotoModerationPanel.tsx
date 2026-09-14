import { useEffect, useState } from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { listAllPhotosForModeration, moderatePhoto, getSignedPhotoUrl, type ModerationPhoto } from '../lib/photosApi';
import { revealPhotos } from '../lib/eventApi';
import { sortPhotosForTriage, getModerationDecisionFromSwipe, type ModerationDecision } from '../lib/photoModerationQueue';

interface PhotoModerationPanelProps {
  onClose: () => void;
}

// Mismo umbral que el swipe de marcos de CameraCapture.tsx -- un arrastre
// más corto que esto es más probable que sea un tap o scroll accidental.
const SWIPE_THRESHOLD = 48;

/**
 * PhotoModerationPanel -- triage de fotos del admin, a pantalla completa
 * (Etapa 9, Frente 2 del backlog). Reemplaza el panel colapsable con
 * miniaturas de 64px por un carrete de a una foto grande por vez, mismo
 * patrón de overlay que QrScanner.tsx/CameraCapture.tsx (header con label +
 * "Cerrar", cuerpo full-bleed).
 *
 * La cola se ordena de más antigua a más nueva (`sortPhotosForTriage`, en
 * lib/photoModerationQueue.ts) -- al revés del orden descendente que usa
 * `listAllPhotosForModeration` para otros usos. El contador del header
 * ("Fotos // N de M") es siempre "1 de {cola restante}": este triage
 * muestra la cabeza de la cola una foto a la vez, así que N nunca cambia,
 * pero M baja a medida que se decide cada una.
 *
 * Decidir (con los botones siempre visibles, o con el swipe horizontal
 * sobre la foto como atajo adicional en touch -- izquierda rechaza,
 * derecha aprueba, misma lógica de umbral que el swipe de marcos de
 * CameraCapture) avanza solo a la siguiente foto de la cola. El botón
 * "Revelar el rollo" (mismo `window.confirm` de siempre) se mantiene
 * visible sin importar el estado de la cola; si queda algo sin moderar al
 * tocarlo, el confirm suma una línea de aviso, sin bloquear la acción.
 *
 * Mismo criterio de testing que CameraCapture.tsx: la lógica pura del
 * orden y de la dirección del swipe vive en lib/photoModerationQueue.ts
 * (testable sin URLs de Storage reales); el gesto de pan de framer-motion
 * en sí no es testable en jsdom, ver PhotoModerationPanel.test.tsx para el
 * detalle de qué sí/no está cubierto.
 */
export default function PhotoModerationPanel({ onClose }: PhotoModerationPanelProps) {
  const [queue, setQueue] = useState<ModerationPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // Guarda contra un doble-tap/doble-click rápido en el mismo disparo de
  // moderatePhoto: sin esto, dos llamadas para el mismo id llegan antes de
  // que la cola avance (no pierde datos, pero es una llamada de red de más
  // y una condición de carrera innecesaria).
  const [pending, setPending] = useState(false);

  const current = queue[0] ?? null;

  useEffect(() => {
    let active = true;
    listAllPhotosForModeration()
      .then((all) => {
        if (!active) return;
        setQueue(sortPhotosForTriage(all.filter((p) => p.status === 'pending')));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'No pudimos cargar las fotos.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!current) {
      setPhotoUrl(null);
      return;
    }
    let active = true;
    setPhotoUrl(null);
    getSignedPhotoUrl(current.storagePath)
      .then((url) => {
        if (active) setPhotoUrl(url);
      })
      .catch(() => {
        /* la foto simplemente no aparece; los botones de decisión siguen usables */
      });
    return () => {
      active = false;
    };
  }, [current]);

  async function handleModerate(status: ModerationDecision) {
    if (!current || pending) return;
    setError(null);
    setPending(true);
    try {
      await moderatePhoto(current.id, status);
      setQueue((prev) => prev.slice(1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos actualizar la foto.');
    } finally {
      setPending(false);
    }
  }

  function handlePanEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    const decision = getModerationDecisionFromSwipe(info.offset.x, SWIPE_THRESHOLD);
    if (decision) handleModerate(decision);
  }

  async function handleReveal() {
    let message = '¿Revelar el rollo? Esta acción no se puede deshacer para este evento.';
    if (queue.length > 0) {
      message += `\n\nQuedan ${queue.length} fotos sin moderar, no van a aparecer en el rollo hasta que las decidas.`;
    }
    if (!window.confirm(message)) return;
    setError(null);
    try {
      await revealPhotos();
      setRevealed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos revelar el rollo.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950" aria-label="Moderación de fotos">
      <header className="flex flex-col gap-2 bg-ink-900 px-4 py-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-acid-400">
            {current ? `Fotos // 1 de ${queue.length}` : 'Fotos // cola de moderación'}
          </span>
          {current && <span className="font-sans text-sm font-bold text-paper-100">{current.guestFullName}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReveal}
            disabled={revealed}
            className="tap-target border border-smoke-700/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-flame-500 transition-colors hover:bg-flame-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revealed ? 'Rollo revelado' : 'Revelar el rollo'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="tap-target flex items-center justify-center bg-smoke-700/30 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 transition-colors hover:bg-smoke-700/50"
          >
            Cerrar
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="bg-flame-500/10 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-flame-500">
          {error}
        </p>
      )}

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">Cargando...</span>
          </div>
        ) : !current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
              No hay fotos pendientes de moderación.
            </p>
          </div>
        ) : (
          <>
            <motion.div
              className="relative flex flex-1 touch-pan-y items-center justify-center overflow-hidden bg-ink-950 p-4"
              onPanEnd={handlePanEnd}
            >
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={`Foto de ${current.guestFullName}`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">Cargando foto...</span>
              )}
            </motion.div>

            <div className="flex items-center justify-center gap-3 bg-ink-900 p-3">
              <button
                type="button"
                onClick={() => handleModerate('rejected')}
                disabled={pending}
                className="tap-target flex-1 max-w-xs border border-smoke-700/50 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-flame-500 transition-colors hover:bg-flame-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => handleModerate('approved')}
                disabled={pending}
                className="tap-target flex-1 max-w-xs border border-smoke-700/50 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-acid-400 transition-colors hover:bg-acid-400/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Aprobar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
