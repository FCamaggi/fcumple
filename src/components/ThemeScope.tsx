import { useLayoutEffect, type ReactNode } from 'react';
import { resolveTheme, themeCssVars, type ThemePreset } from '../lib/theme';

/**
 * Aplica el estilo de un evento: escribe las variables CSS del preset en `<html>` (no en un `div`, para que
 * también las vean los modales, la cámara a pantalla completa y el fondo bajo el contenido) y pinta la barra
 * del navegador del color del fondo. Al salir lo deja todo como estaba, así que un tema no se filtra a otra
 * pantalla.
 */
function applyTheme(preset: ThemePreset): () => void {
  const root = document.documentElement;
  const vars = themeCssVars(preset.colors);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const created = !meta;
  const previous = meta?.getAttribute('content') ?? null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', preset.colors.bg);

  return () => {
    for (const name of Object.keys(vars)) root.style.removeProperty(name);
    if (created) meta?.remove();
    else if (previous !== null) meta?.setAttribute('content', previous);
  };
}

export default function ThemeScope({ theme, children }: { theme: unknown; children: ReactNode }) {
  const preset = resolveTheme(theme);
  useLayoutEffect(() => applyTheme(preset), [preset]);
  return <>{children}</>;
}
