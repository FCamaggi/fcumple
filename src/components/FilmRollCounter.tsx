import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface FilmRollCounterProps {
  quota: number;
  used: number;
  /**
   * Versión baja para la cabecera de la cámara: solo la ventanita y «de N», sin dientes ni rótulo. El
   * dígito va en papel y no en el acento: en la cámara el acento es solo del obturador.
   */
  compact?: boolean;
}

/**
 * FilmRollCounter (DESIGN.md §7.9) -- el contador mecánico de una cámara
 * descartable real: una ventanita en font-mono con el número de disparos
 * restantes, que "clickea" un dígito hacia abajo con cada foto en vez de
 * una barra de progreso o un "3/5" en texto plano. Los dientes del dial
 * alrededor de la ventana son decorativos (aria-hidden); el número real y
 * su significado van en un solo `aria-label` accesible para lectores de
 * pantalla.
 */
export default function FilmRollCounter({ quota, used, compact = false }: FilmRollCounterProps) {
  const remaining = Math.max(0, quota - used);
  const reduceMotion = useReducedMotion() ?? false;
  const empty = remaining === 0;

  return (
    <div
      role="img"
      aria-label={`${remaining} disparos restantes de ${quota}`}
      className={`flex items-center bg-ink-950 shadow-inner ${compact ? 'gap-2 px-2 py-1' : 'gap-3 p-3'}`}
    >
      <div className="flex items-center" aria-hidden>
        {/* Sprocket-hole strip, purely decorative -- evokes the film canister edge. */}
        {!compact && (
          <div className="flex flex-col gap-1 pr-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-smoke-700/50" />
            ))}
          </div>
        )}

        <div
          className={`relative flex items-center justify-center overflow-hidden border-2 border-smoke-700/60 bg-ink-900 ${
            compact ? 'h-9 w-12' : 'h-12 w-16'
          }`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={remaining}
              initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className={`font-mono font-bold tabular-nums ${compact ? 'text-xl' : 'text-2xl'} ${
                empty ? 'text-flame-500' : compact ? 'text-paper-100' : 'text-acid-400'
              }`}
            >
              {remaining}
            </motion.span>
          </AnimatePresence>
        </div>

        {!compact && (
          <div className="flex flex-col gap-1 pl-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-smoke-700/50" />
            ))}
          </div>
        )}
      </div>

      {compact ? (
        <span className={`font-mono text-xs uppercase tracking-wide ${empty ? 'text-flame-500' : 'text-paper-100/70'}`}>
          {empty ? 'Sin disparos' : `de ${quota}`}
        </span>
      ) : (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-paper-100/70">
            Rollo // disparos
          </span>
          <span className={`font-mono text-xs uppercase tracking-wide ${empty ? 'text-flame-500' : 'text-paper-100/70'}`}>
            {empty ? 'Se acabó el rollo' : `de ${quota} en total`}
          </span>
        </div>
      )}
    </div>
  );
}
