/**
 * Tipografías y texto de una línea para los marcos de la cámara. Vive aparte de
 * `frames.ts` para que las plantillas y las capas (`layers.ts`) lo compartan sin
 * importarse entre sí.
 */

export const FRAME_FONTS = ['sans', 'serif', 'mono', 'display', 'hand', 'typewriter'] as const;
export type FrameFont = (typeof FRAME_FONTS)[number];

export const FONT_LABELS: Record<FrameFont, string> = {
  sans: 'Moderna',
  serif: 'Clásica',
  mono: 'Técnica',
  display: 'Titular',
  hand: 'Manuscrita',
  typewriter: 'Máquina de escribir',
};

/** Pilas de fuentes del sistema: sin descargas, y el canvas las resuelve igual que el DOM. */
export const FONT_STACKS: Record<FrameFont, string> = {
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  display: 'Impact, "Arial Narrow Bold", "Arial Black", sans-serif',
  hand: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
  typewriter: '"American Typewriter", "Courier New", Courier, monospace',
};

type Ctx = CanvasRenderingContext2D;

export interface TextOptions {
  font: FrameFont;
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
