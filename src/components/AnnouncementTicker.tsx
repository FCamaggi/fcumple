import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { Post } from '../types';

interface AnnouncementTickerProps {
  posts: Post[];
}

/**
 * AnnouncementTicker — DESIGN.md §7.8. Marquesina/letrero de neón con texto
 * corrido: los títulos de los avisos más recientes circulan, y tocar uno lo
 * expande a la nota completa con el mismo lenguaje flicker de neón que
 * `LoadingLights`/`ConfirmedScreen` en GuestPage. Es un plus, no un elemento
 * crítico de la pantalla: sin posts publicados, no renderiza nada visible.
 */
export default function AnnouncementTicker({ posts }: AnnouncementTickerProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (posts.length === 0) return null;

  const expanded = posts.find((p) => p.id === expandedId) ?? null;
  // Duplicated once so the CSS-driven scroll (translateX 0 -> -50%) loops
  // seamlessly; with reduced motion the list is static, so no duplicate is
  // needed (it would just read the same titles twice for no reason).
  const trackItems = reduceMotion ? posts : [...posts, ...posts];

  return (
    <section className="flex flex-col gap-2 bg-ink-900 p-3 shadow-xl" aria-label="Avisos del evento">
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500">
        On air // avisos
      </span>

      <div className="relative overflow-hidden border border-smoke-700/50 bg-ink-950 py-2">
        <div className={`flex w-max gap-8 whitespace-nowrap px-3 ${reduceMotion ? '' : 'animate-ticker'}`}>
          {trackItems.map((post, i) => (
            <button
              key={`${post.id}-${i}`}
              type="button"
              onClick={() => setExpandedId(post.id)}
              className="font-mono text-xs uppercase tracking-widest text-paper-100 transition-colors hover:text-acid-400"
            >
              ● {post.title}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key={expanded.id}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: [0.2, 1, 0.3, 1, 1] }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.9, times: [0, 0.3, 0.5, 0.7, 1] }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-1 bg-ink-950 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg uppercase leading-tight text-acid-400">{expanded.title}</h3>
              <button
                type="button"
                onClick={() => setExpandedId(null)}
                aria-label="Cerrar aviso"
                className="tap-target shrink-0 font-mono text-xs text-paper-100/70"
              >
                ✕
              </button>
            </div>
            <p className="font-sans text-sm text-paper-100/90">{expanded.body}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
