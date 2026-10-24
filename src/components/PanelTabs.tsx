import { useEffect, useRef } from 'react';

interface Props<Id extends string> {
  /** `badge`: una cuenta que se dibuja en la pestaña (con cero no se dibuja) y su explicación para lectores de pantalla. */
  tabs: ReadonlyArray<{ id: Id; label: string; badge?: { count: number; hint: string } }>;
  active: Id;
  onSelect: (id: Id) => void;
}

/**
 * Pestañas del panel del organizador. En un teléfono las 9 no caben en una fila: van en una sola fila con
 * scroll horizontal (en vez de apilarse en 3) y la activa se lleva a la vista al cambiar. 44 px de alto
 * (objetivo táctil); el borde cortado de la pestaña siguiente avisa de que hay más.
 */
export default function PanelTabs<Id extends string>({ tabs, active, onSelect }: Props<Id>) {
  const refs = useRef(new Map<Id, HTMLButtonElement>());
  // La pestaña de la última vez que se desplazó: solo se mueve cuando cambia, no al montar (y es idempotente bajo
  // StrictMode, donde el efecto corre dos veces al montar).
  const shown = useRef(active);

  useEffect(() => {
    if (shown.current === active) return;
    shown.current = active;
    // jsdom y navegadores viejos no traen matchMedia ni scrollIntoView.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    refs.current.get(active)?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }, [active]);

  return (
    <nav className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Secciones">
      <div className="flex w-max gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(node) => {
              if (node) refs.current.set(t.id, node);
              else refs.current.delete(t.id);
            }}
            type="button"
            aria-current={active === t.id ? 'page' : undefined}
            onClick={() => onSelect(t.id)}
            className={`h-11 shrink-0 px-4 font-mono text-xs uppercase tracking-wider ${
              active === t.id ? 'bg-acid-400 text-ink-950' : 'border border-smoke-700/60 text-paper-100'
            }`}
          >
            {t.label}
            {t.badge && t.badge.count > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className={`ml-2 inline-block min-w-5 px-1.5 text-center text-xs leading-5 ${
                    active === t.id ? 'bg-ink-950 text-acid-400' : 'bg-acid-400 text-ink-950'
                  }`}
                >
                  {t.badge.count > 99 ? '99+' : t.badge.count}
                </span>
                <span className="sr-only">{`, ${t.badge.count} ${t.badge.hint}`}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
