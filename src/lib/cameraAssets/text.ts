/**
 * Tipografías y texto de una línea para los marcos de la cámara. Vive aparte de
 * `frames.ts` para que las plantillas y las capas (`layers.ts`) lo compartan sin
 * importarse entre sí.
 */

export const FRAME_FONTS = ['sans', 'serif', 'mono', 'display', 'hand', 'typewriter'] as const;
export type FrameFont = (typeof FRAME_FONTS)[number];

/**
 * Tipografías web (autoalojadas con @fontsource) que solo usan las capas, elegidas
 * para el estilo de cada cliente. Se descargan al usarlas, no al abrir la app.
 */
export const WEB_FONTS = ['anton', 'playfair', 'pacifico', 'marker', 'elite'] as const;
export type WebFont = (typeof WEB_FONTS)[number];

/** Todas las que admite una capa de texto: las del sistema más las web. */
export const LAYER_FONTS = [...FRAME_FONTS, ...WEB_FONTS] as const;
export type LayerFont = (typeof LAYER_FONTS)[number];

/**
 * Catálogo acotado de 4 tipografías que ofrece el Estudio de marcos:
 * - Anton (Afiche): titular de bloque con fuerte impacto.
 * - Pacifico (Rosa): caligrafía fluida y festiva.
 * - Permanent Marker (Marcador): estilo rotulador y sello informal.
 * - Special Elite (Máquina vieja): estética mecánica y boleto vintage.
 *
 * Elegidas comparando las 11 familias tipográficas disponibles sobre diseños reales.
 *
 * IMPORTANTE: Las 11 tipografías históricas (FRAME_FONTS + WEB_FONTS) se mantienen
 * completamente válidas en LAYER_FONTS, FONT_LABELS, FONT_STACKS, WEB_FONT_FACES
 * y en las validaciones de base de datos. Existen marcos ya guardados y briefs
 * específicos (como el brief de ejemplo en visuals.tsx) que utilizan fuentes del sistema o
 * Playfair. Quitarlas de la validación o del dibujo rompería el renderizado de marcos
 * existentes y haría desaparecer sus textos.
 */
export const CATALOG_FONTS = ['anton', 'pacifico', 'marker', 'elite'] as const;
export type CatalogFont = (typeof CATALOG_FONTS)[number];

/** Comprueba si una tipografía dada pertenece al catálogo corto ofrecido por el Estudio. */
export function isCatalogFont(font: unknown): font is CatalogFont {
  return typeof font === 'string' && (CATALOG_FONTS as readonly string[]).includes(font);
}

/**
 * Tipografías que ofrece el selector del Estudio:
 * Devuelve el catálogo de 4 tipografías recomendadas y, únicamente si la capa actual
 * tiene configurada una tipografía válida de LAYER_FONTS que no forme parte del catálogo
 * (p. ej. una fuente de sistema o Playfair de un marco guardado previamente), la añade
 * al final de las opciones para que no se pierda al editar.
 * Un valor de `current` no reconocido o indefinido no añade ninguna opción adicional.
 */
export function fontsOffered(current?: string): LayerFont[] {
  const result: LayerFont[] = [...CATALOG_FONTS];
  if (current && (LAYER_FONTS as readonly string[]).includes(current) && !isCatalogFont(current)) {
    result.push(current as LayerFont);
  }
  return result;
}

/**
 * Nombre para mostrar en el selector de tipografías:
 * Usa el nombre amigable de FONT_LABELS para las tipografías del catálogo y agrega
 * el sufijo «(antigua)» a cualquier otra fuente histórica que conserve una capa.
 */
export function fontOptionLabel(font: LayerFont): string {
  const label = FONT_LABELS[font];
  return isCatalogFont(font) ? label : `${label} (antigua)`;
}

export const FONT_LABELS: Record<LayerFont, string> = {
  sans: 'Moderna',
  serif: 'Clásica',
  mono: 'Técnica',
  display: 'Titular',
  hand: 'Manuscrita',
  typewriter: 'Máquina de escribir',
  anton: 'Afiche (Anton)',
  playfair: 'Glam (Playfair)',
  pacifico: 'Rosa (Pacifico)',
  marker: 'Marcador (Permanent Marker)',
  elite: 'Máquina vieja (Special Elite)',
};

/** Pilas de fuentes: las del sistema no descargan nada y el canvas las resuelve igual que el DOM. */
export const FONT_STACKS: Record<LayerFont, string> = {
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  display: 'Impact, "Arial Narrow Bold", "Arial Black", sans-serif',
  hand: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
  typewriter: '"American Typewriter", "Courier New", Courier, monospace',
  anton: '"Anton", Impact, "Arial Narrow Bold", sans-serif',
  playfair: '"Playfair Display", Georgia, "Times New Roman", serif',
  pacifico: '"Pacifico", "Brush Script MT", cursive',
  marker: '"Permanent Marker", "Marker Felt", "Bradley Hand", cursive',
  elite: '"Special Elite", "American Typewriter", "Courier New", monospace',
};

/** Qué CSS importar (registra el @font-face) y qué pesos esperar antes de dibujar en el canvas. */
const WEB_FONT_FACES: Record<WebFont, { family: string; weights: number[]; load: () => Promise<unknown> }> = {
  anton: { family: 'Anton', weights: [400], load: () => import('@fontsource/anton/latin-400.css') },
  playfair: {
    family: 'Playfair Display',
    weights: [400, 700],
    load: () => Promise.all([import('@fontsource/playfair-display/latin-400.css'), import('@fontsource/playfair-display/latin-700.css')]),
  },
  pacifico: { family: 'Pacifico', weights: [400], load: () => import('@fontsource/pacifico/latin-400.css') },
  marker: { family: 'Permanent Marker', weights: [400], load: () => import('@fontsource/permanent-marker/latin-400.css') },
  elite: { family: 'Special Elite', weights: [400], load: () => import('@fontsource/special-elite/latin-400.css') },
};

export interface FontLoaders {
  importCss: (font: WebFont) => Promise<unknown>;
  loadFace: (descriptor: string) => Promise<unknown>;
}

const defaultLoaders: FontLoaders = {
  importCss: (font) => WEB_FONT_FACES[font].load(),
  loadFace: (descriptor) => document.fonts.load(descriptor),
};

/**
 * Descarga las tipografías web pedidas y espera a que el canvas pueda usarlas:
 * sin `document.fonts.load`, la primera foto saldría con la tipografía de reserva.
 * Las del sistema y las desconocidas se ignoran, y una que falla no impide las demás
 * ni rechaza (el texto se dibuja con la pila de reserva).
 */
export async function loadLayerFonts(fonts: readonly string[], loaders: FontLoaders = defaultLoaders): Promise<void> {
  const wanted = [...new Set(fonts)].filter((f): f is WebFont => (WEB_FONTS as readonly string[]).includes(f));
  await Promise.all(
    wanted.map(async (font) => {
      try {
        await loaders.importCss(font);
        const { family, weights } = WEB_FONT_FACES[font];
        await Promise.all(weights.map((weight) => loaders.loadFace(`${weight} 16px "${family}"`)));
      } catch {
        // Sin red o sin soporte: queda la tipografía de reserva de la pila.
      }
    }),
  );
}

type Ctx = CanvasRenderingContext2D;

export interface TextOptions {
  font: LayerFont;
  color: string;
  weight?: 'normal' | 'bold';
  align?: CanvasTextAlign;
  /** Contorno en píxeles; se traza antes del relleno para que no se coma las letras. */
  strokeColor?: string;
  strokeWidth?: number;
}

/**
 * Dibuja un texto en una sola línea que SIEMPRE cabe en `maxWidth`: primero
 * reduce el tamaño (hasta `minSize`) y, si aun así no cabe, lo trunca con "…".
 */
export function drawFittedText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxSize: number,
  options: TextOptions,
): void {
  const trimmed = text.trim();
  if (!trimmed || maxWidth <= 0 || maxSize <= 0) return;

  const weight = options.weight ?? 'normal';
  const minSize = Math.max(6, maxSize * 0.35);
  const family = FONT_STACKS[options.font];
  const setFont = (size: number) => {
    ctx.font = `${weight} ${Math.round(size)}px ${family}`;
  };

  let size = maxSize;
  setFont(size);
  while (ctx.measureText(trimmed).width > maxWidth && size > minSize) {
    size *= 0.92;
    setFont(size);
  }

  let shown = trimmed;
  while (shown.length > 1 && ctx.measureText(shown).width > maxWidth) {
    shown = `${shown.slice(0, -2).trimEnd()}…`;
  }

  ctx.textAlign = options.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (options.strokeColor && options.strokeWidth && options.strokeWidth > 0) {
    ctx.strokeStyle = options.strokeColor;
    ctx.lineWidth = options.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(shown, x, y);
  }
  ctx.fillStyle = options.color;
  ctx.fillText(shown, x, y);
}
