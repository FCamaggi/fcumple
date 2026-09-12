import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface HeadcountMeterProps {
  confirmed: number;
  total: number;
  pending?: number;
  declined?: number;
}

const BAR_COUNT = 14;

/**
 * HeadcountMeter — el contador de gente confirmada.
 * Se ve como un VU meter/ecualizador: barras que suben en acid-400 según
 * proporción de confirmados, con el número grande en Display al lado.
 */
export default function HeadcountMeter({ confirmed, total, pending = 0, declined = 0 }: HeadcountMeterProps) {
  const reduceMotion = useReducedMotion();
  const ratio = total > 0 ? Math.min(1, confirmed / total) : 0;
  const litBars = Math.round(ratio * BAR_COUNT);
  const [displayCount, setDisplayCount] = useState(reduceMotion ? confirmed : 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplayCount(confirmed);
      return;
    }
    const duration = 700;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplayCount(Math.round(confirmed * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [confirmed, reduceMotion]);

  return (
    <div className="flex flex-col justify-between rounded bg-ink-950 p-4 shadow-inner">
      <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
        <span className="font-bold text-acid-400">Aforo VU // confirmados</span>
        <span className="text-laser-500">{total} cupos totales</span>
      </div>

      <div className="flex items-center gap-4 py-1">
        <div className="flex h-24 items-end gap-1 rounded bg-ink-900 p-2" aria-hidden>
          {Array.from({ length: BAR_COUNT }, (_, i) => {
            const lit = i < litBars;
            return (
              <motion.span
                key={i}
                className={`w-2 rounded-sm ${lit ? 'bg-acid-400' : 'bg-smoke-700/30'}`}
                style={{ height: `${((i + 1) / BAR_COUNT) * 100}%` }}
                animate={lit && !reduceMotion ? { opacity: [1, 0.75, 1] } : { opacity: 1 }}
                transition={{ duration: 1.4, repeat: lit && !reduceMotion ? Infinity : 0, delay: i * 0.05 }}
              />
            );
          })}
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-5xl leading-none tracking-tight text-acid-400">{displayCount}</span>
            <span className="font-mono text-sm font-bold text-paper-100/70">/ {total}</span>
          </div>
          <div className="mt-1 font-display text-sm uppercase tracking-wide text-paper-100">Confirmados en pista</div>
          <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-ink-900">
            <div className="h-full bg-acid-400" style={{ width: `${(confirmed / Math.max(total, 1)) * 100}%` }} />
            <div className="h-full bg-laser-500" style={{ width: `${(pending / Math.max(total, 1)) * 100}%` }} />
            <div className="h-full bg-flame-500" style={{ width: `${(declined / Math.max(total, 1)) * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] uppercase text-paper-100/70">
            <span>Pendientes: {pending}</span>
            <span className="font-bold text-acid-400">Disponibles: {Math.max(total - confirmed, 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
