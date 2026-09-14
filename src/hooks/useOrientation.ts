import { useEffect, useState } from 'react';

export type Orientation = 'portrait' | 'landscape';

const QUERY = '(orientation: portrait)';

/**
 * useOrientation -- mismo criterio que useIsMobile: detección real vía
 * `matchMedia`, suscrita a los cambios en vez de medir una sola vez al
 * montar. La cámara dedicada (docs/BACKLOG.md Etapa 8) la usa para ajustar
 * sus marcos de encuadre cuando el invitado gira el teléfono con la
 * cámara ya abierta.
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(() =>
    window.matchMedia(QUERY).matches ? 'portrait' : 'landscape',
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent | { matches: boolean }) =>
      setOrientation(e.matches ? 'portrait' : 'landscape');

    setOrientation(mql.matches ? 'portrait' : 'landscape');
    mql.addEventListener('change', onChange as (e: MediaQueryListEvent) => void);
    return () => mql.removeEventListener('change', onChange as (e: MediaQueryListEvent) => void);
  }, []);

  return orientation;
}
