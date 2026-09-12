import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface FilmRollCounterProps {
  quota: number;
  used: number;
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
export default function FilmRollCounter({ quota, used }: FilmRollCounterProps) {
  const remaining = Math.max(0, quota - used);
  const reduceMotion = useReducedMotion() ?? false;
  const empty = remaining === 0;

  return (
    <div
      role="img"
      aria-label={`${remaining} disparos restantes de ${quota}`}
      className="flex items-center gap-3 bg-ink-950 p-3 shadow-inner"
    >
      <div className="flex items-center" aria-hidden>
        {/* Sprocket-hole strip, purely decorative -- evokes the film canister edge. */}
        <div className="flex flex-col gap-1 pr-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-smoke-700/50" />
          ))}
        </div>

        <div className="relative flex h-12 w-16 items-center justify-center overflow-hidden border-2 border-smoke-700/60 bg-ink-900">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={remaining}
              initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'linear' }}
              className={`font-mono text-2xl font-bold tabular-nums ${
                empty ? 'text-flame-500' : 'text-acid-400'
              }`}
            >
              {remaining}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-1 pl-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-smoke-700/50" />
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-paper-100/70">
          Rollo // disparos
        </span>
        <span className={`font-mono text-[11px] uppercase tracking-wide ${empty ? 'text-flame-500' : 'text-paper-100/70'}`}>
          {empty ? 'Se acabó el rollo' : `de ${quota} en total`}
        </span>
      </div>
    </div>
  );
}
