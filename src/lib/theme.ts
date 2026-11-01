/**
 * Estilo por evento (tenant). La app tiene UNA estructura (boleto, rollo, etiquetas de máquina, formas rectas)
 * y cada evento elige su PIEL: los colores. Los nombres de los tokens de Tailwind (`ink-950`, `acid-400`…) se
 * conservan y ahora son variables CSS; aquí se definen los valores de cada preset.
 *
 * Roles (ver DESIGN.md):
 *   bg        → ink-950    fondo de página, campos y TEXTO sobre el botón principal
 *   surface   → ink-900    tarjetas y paneles
 *   border    → smoke-700  bordes y perforaciones (decorativo)
 *   text      → paper-100  texto principal
 *   accent    → acid-400   la acción principal (botón, modo activo)
 *   label     → laser-500  etiqueta del evento
 *   emphasis  → hotpink-500 énfasis, selección y el botón de la cámara
 *   error     → flame-500  errores y rollo agotado
 *
 * En la base solo se guarda el id del preset (`events.theme = {"preset": "rosa-chicle"}`); los colores viven
 * aquí y un test comprueba el contraste WCAG AA de cada preset. Un id que no existe cae en el neón de siempre.
 */

export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  accent: string;
  label: string;
  emphasis: string;
  error: string;
}

export interface ThemePreset {
  id: string;
  label: string;
  colors: ThemeColors;
}

export const DEFAULT_THEME_ID = 'neon';

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'neon',
    label: 'Neón (el de siempre)',
    colors: {
      bg: '#0d0b12',
      surface: '#16121d',
      border: '#3a3244',
      text: '#f3ecf7',
      accent: '#c8ff3d',
      label: '#00e6d8',
      emphasis: '#ff2f92',
      error: '#ff5a1f',
    },
  },
  {
    id: 'rosa-chicle',
    label: 'Rosa chicle y negro',
    colors: {
      bg: '#150a12',
      surface: '#220f1b',
      border: '#5a2a45',
      text: '#fff0f6',
      accent: '#ff5fa2',
      label: '#ffb3d4',
      emphasis: '#ff8fc0',
      error: '#ff7a45',
    },
  },
  {
    id: 'vino-dorado',
    label: 'Vino y dorado',
    colors: {
      bg: '#1a0b10',
      surface: '#26121a',
      border: '#5a2a36',
      text: '#f6ead0',
      accent: '#c9a24b',
      label: '#e0c070',
      emphasis: '#ee8fa3',
      error: '#ff7a5c',
    },
  },
  {
    id: 'calabaza',
    label: 'Calabaza (negro y naranja)',
    colors: {
      bg: '#0e0e0e',
      surface: '#1a1a1a',
      border: '#4a3a2a',
      text: '#fff3e6',
      accent: '#ff7a1a',
      label: '#ffb066',
      emphasis: '#ffa36b',
      error: '#ff6b6b',
    },
  },
  {
    id: 'gala',
    label: 'Gala (negro, dorado y rojo)',
    colors: {
      bg: '#0e0c0b',
      surface: '#1a1715',
      border: '#4a3f33',
      text: '#f4eee3',
      accent: '#c9a55a',
      label: '#ddc48a',
      emphasis: '#e0605a',
      error: '#f2875c',
    },
  },
];

/** El tema de un evento a partir de lo que guarda la base (`events.theme`). Nunca lanza. */
export function resolveTheme(raw: unknown): ThemePreset {
  const fallback = THEME_PRESETS.find((p) => p.id === DEFAULT_THEME_ID) as ThemePreset;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fallback;
  const id = (raw as { preset?: unknown }).preset;
  return THEME_PRESETS.find((p) => p.id === id) ?? fallback;
}

/** "#ff5fa2" → "255 95 162": los canales que usa `rgb(var(--c-…) / <alpha>)` en Tailwind. */
export function hexToChannels(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

export function themeCssVars(c: ThemeColors): Record<string, string> {
  return {
    '--c-ink-950': hexToChannels(c.bg),
    '--c-ink-900': hexToChannels(c.surface),
    '--c-smoke-700': hexToChannels(c.border),
    '--c-paper-100': hexToChannels(c.text),
    '--c-acid-400': hexToChannels(c.accent),
    '--c-laser-500': hexToChannels(c.label),
    '--c-hotpink-500': hexToChannels(c.emphasis),
    '--c-flame-500': hexToChannels(c.error),
  };
}

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG 2.x entre dos colores `#rrggbb` (de 1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
