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
