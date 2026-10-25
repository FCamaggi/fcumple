import { useEffect } from 'react';

// Cuántas capas a pantalla completa piden el bloqueo a la vez: el scroll se libera al cerrar la última.
let locks = 0;
let saved: { html: string; body: string; htmlOverscroll: string; bodyOverscroll: string } | null = null;

/**
 * useScrollLock — mientras `active`, la página de atrás no se desplaza. Una capa `fixed` a pantalla
 * completa (la cámara) no lo evita sola: un arrastre sobre sus controles encadena el scroll al documento,
 * se ven los avisos de atrás y la barra del navegador móvil se esconde o aparece, cambiando el alto de la
 * capa en pleno uso.
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    if (locks === 0) {
      saved = {
        html: html.style.overflow,
        body: body.style.overflow,
        htmlOverscroll: html.style.overscrollBehavior,
        bodyOverscroll: body.style.overscrollBehavior,
      };
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      html.style.overscrollBehavior = 'none';
      body.style.overscrollBehavior = 'none';
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks > 0 || !saved) return;
      html.style.overflow = saved.html;
      body.style.overflow = saved.body;
      html.style.overscrollBehavior = saved.htmlOverscroll;
      body.style.overscrollBehavior = saved.bodyOverscroll;
      saved = null;
    };
  }, [active]);
}
