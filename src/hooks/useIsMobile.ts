import { useEffect, useState } from 'react';

// Debajo de esto, /admin cambia a "modo puerta" (docs/BACKLOG.md, Decisión
// 4.1): el admin real de este proyecto va a estar parado en la puerta con
// el teléfono en la mano buena parte de la noche.
export const MOBILE_BREAKPOINT = 768;

/**
 * useIsMobile — detección real de viewport vía `matchMedia`, no un
 * breakpoint de Tailwind aplicado a ciegas. Se suscribe a los cambios (girar
 * el teléfono, redimensionar la ventana) en vez de medir una sola vez al
 * montar.
 */
export function useIsMobile(): boolean {
  const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent | { matches: boolean }) => setIsMobile(e.matches);

    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange as (e: MediaQueryListEvent) => void);
    return () => mql.removeEventListener('change', onChange as (e: MediaQueryListEvent) => void);
  }, [query]);

  return isMobile;
}
