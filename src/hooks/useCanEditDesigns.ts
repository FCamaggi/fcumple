import { useEffect, useState } from 'react';

// Los diseños (marcos y stickers) se editan solo con puntero fino y una ventana
// de al menos 1024 px. En el celular se ven en solo lectura: el lienzo del
// editor es pequeño y sus asas no se pueden tocar con el dedo. No es un control
// de acceso: quién puede escribir lo decide RLS (`is_event_owner`).
export const DESIGN_EDIT_QUERY = '(pointer: fine) and (min-width: 1024px)';

/**
 * useCanEditDesigns — `true` si el dispositivo sirve para editar diseños. Igual
 * que `useIsMobile`, se suscribe a los cambios en vez de medir una sola vez.
 */
export function useCanEditDesigns(): boolean {
  const [canEdit, setCanEdit] = useState(() => window.matchMedia(DESIGN_EDIT_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(DESIGN_EDIT_QUERY);
    const onChange = (e: MediaQueryListEvent | { matches: boolean }) => setCanEdit(e.matches);

    setCanEdit(mql.matches);
    mql.addEventListener('change', onChange as (e: MediaQueryListEvent) => void);
    return () => mql.removeEventListener('change', onChange as (e: MediaQueryListEvent) => void);
  }, []);

  return canEdit;
}
