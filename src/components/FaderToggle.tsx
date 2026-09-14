import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, animate } from 'framer-motion';

export type FaderValue = 'no' | 'neutral' | 'yes';

interface FaderToggleProps {
  value: FaderValue;
  onChange: (value: FaderValue) => void;
}

const KNOB_WIDTH = 56; // px, matches w-14
const TRACK_PADDING = 4; // px inset so the knob never clips the track edges

function positionFor(value: FaderValue, travel: number) {
  if (value === 'no') return 0;
  if (value === 'yes') return travel;
  return travel / 2;
}

const STATE_STYLES: Record<FaderValue, { track: string; line: string }> = {
  no: { track: 'bg-flame-500/30', line: 'bg-flame-500 shadow-glow-flame' },
  neutral: { track: 'bg-smoke-700/40', line: 'bg-smoke-700' },
  yes: { track: 'bg-acid-400/30', line: 'bg-acid-400 shadow-glow-acid' },
};

/**
 * FaderToggle — el switch de asistencia.
 * Fader horizontal tipo crossfader de DJ entre "NO VOY" y "VOY", con zona
 * intermedia mínima para "sin decidir". El fondo reacciona al extremo activo.
 * Se puede arrastrar el knob o tocar una de las tres zonas de snap.
 */
export default function FaderToggle({ value, onChange }: FaderToggleProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const styles = STATE_STYLES[value];

  // Ancho medido del track, en estado -- no una lectura de ref hecha directo
  // en el cuerpo del render. Bug real encontrado en QA (celular real): el
  // JSX de abajo pasa `dragConstraints={{ left: 0, right: travel() }}` a
  // `motion.div`, y ese objeto se arma durante el render. En el PRIMER
  // render, `trackRef.current` todavía es `null` (los refs se adjuntan
  // recién en el commit, después del render) -- así que ese límite de
  // arrastre quedaba fijo en `{ left: 0, right: 0 }` para siempre, porque
  // nada volvía a renderizar el componente entre el montaje y la primera
  // interacción del usuario. El knob podía *verse* centrado (la posición
  // inicial de `x` sí lee el ref ya montado, ver el efecto de abajo), pero
  // cualquier drag lo clampeaba a x=0 (izquierda) porque ese era el único
  // valor que el límite permitía. Guardar el ancho en estado, seteado desde
  // `useLayoutEffect`, fuerza un segundo render con el valor real ANTES del
  // primer paint (misma garantía de `useLayoutEffect` que ya se usaba para
  // la posición inicial) -- el usuario nunca llega a ver ni a interactuar
  // con el límite viejo.
  const [trackWidth, setTrackWidth] = useState(0);
  function travel(width = trackWidth) {
    return Math.max(width - KNOB_WIDTH - TRACK_PADDING * 2, 0);
  }

  // First mount: jump straight to the right position (no animation, no
  // race). docs/BACKLOG.md §5.3 -- `x` used to start at 0 (left edge) and
  // only reach the center via an async `animate()` inside a plain
  // `useEffect`; a drag/tap before that animation settled read a stale `x`
  // still near 0 and rounded it down to "no". `useLayoutEffect` + a
  // synchronous `x.set()` guarantees the correct position is in place
  // before the user can interact at all, i.e. before paint.
  const isFirstMount = useRef(true);
  useLayoutEffect(() => {
    const width = trackRef.current?.offsetWidth ?? 0;
    setTrackWidth(width);
    if (isFirstMount.current) {
      isFirstMount.current = false;
      x.set(positionFor(value, travel(width)));
      return;
    }
    // Later changes (snap buttons, or a parent resetting the value) still
    // get the springy feel.
    animate(x, positionFor(value, travel(width)), reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0.35, duration: 0.4 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleDragEnd() {
    const t = travel();
    const ratio = t > 0 ? x.get() / t : 0;
    const next: FaderValue = ratio < 0.33 ? 'no' : ratio > 0.66 ? 'yes' : 'neutral';
    onChange(next);
  }

  return (
    <div className={`w-full rounded p-3 shadow-inner transition-colors duration-300 ${styles.track}`}>
      <div className="flex items-center justify-between px-1 pb-1 font-mono text-[10px] uppercase tracking-widest">
        <span className={value === 'no' ? 'font-bold text-flame-500' : 'text-paper-100/70'}>Out / No voy</span>
        <span className={value === 'neutral' ? 'font-bold text-paper-100' : 'text-paper-100/70'}>0dB</span>
        <span className={value === 'yes' ? 'font-bold text-acid-400' : 'text-paper-100/70'}>In / Adentro</span>
      </div>

      <div ref={trackRef} className="relative h-14 rounded bg-ink-950/60">
        <div className="absolute inset-y-0 left-2 right-2 my-auto h-3 overflow-hidden rounded-full bg-ink-950 shadow-inner" />

        {/* Three tap-target snap zones — keyboard/touch accessible fallback to dragging. */}
        <div className="absolute inset-0 grid grid-cols-3">
          <button
            type="button"
            aria-label="No voy"
            aria-pressed={value === 'no'}
            className="tap-target flex items-center justify-start pl-4"
            onClick={() => onChange('no')}
          >
            <span className="font-mono text-[10px] uppercase text-flame-500/70">CH-A</span>
          </button>
          <button
            type="button"
            aria-label="Sin decidir"
            aria-pressed={value === 'neutral'}
            className="tap-target flex items-center justify-center"
            onClick={() => onChange('neutral')}
          >
            <span className="font-mono text-[10px] uppercase text-paper-100/70">Cut</span>
          </button>
          <button
            type="button"
            aria-label="Voy"
            aria-pressed={value === 'yes'}
            className="tap-target flex items-center justify-end pr-4"
            onClick={() => onChange('yes')}
          >
            <span className="font-mono text-[10px] uppercase text-acid-400/70">CH-B</span>
          </button>
        </div>

        <motion.div
          className="tap-target absolute left-1 top-1 z-10 flex w-14 cursor-grab flex-col items-center justify-center rounded bg-ink-900 shadow-2xl active:cursor-grabbing"
          style={{ x }}
          drag="x"
          dragConstraints={{ left: 0, right: travel() }}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
        >
          <div className={`h-7 w-1 rounded-full transition-colors duration-300 ${styles.line}`} />
        </motion.div>
      </div>

      <div className="mt-2 flex justify-between px-1 font-mono text-[11px] font-bold uppercase tracking-wide">
        <span className={value === 'no' ? 'text-flame-500' : 'text-paper-100/70'}>No voy</span>
        <span className={value === 'neutral' ? 'text-paper-100' : 'text-paper-100/70'}>Centro</span>
        <span className={value === 'yes' ? 'text-acid-400' : 'text-paper-100/70'}>Voy</span>
      </div>
    </div>
  );
}
