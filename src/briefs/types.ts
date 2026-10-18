import type { FrameFont, FrameTemplate } from '../lib/cameraAssets/frames';

/** Paleta de un evento: fondo, acento, color secundario y texto (todos #RRGGBB). */
export interface BriefPalette {
  bg: string;
  accent: string;
  soft: string;
  text: string;
}

/** Marco de ejemplo: una plantilla real de la cámara, o una propuesta a medida. */
export type BriefFrame = FrameTemplate | 'conejita';

export interface BriefOption {
  id: string;
  label: string;
  hint?: string;
  /** Paleta de colores (preguntas con `visual: 'palette'`). */
  palette?: BriefPalette;
  /** Tipografía real de la cámara (preguntas con `visual: 'font'`). */
  font?: FrameFont;
  /** Marco de ejemplo (preguntas con `visual: 'frame'`). */
  frame?: BriefFrame;
  /** Emojis de ejemplo (preguntas con `visual: 'emoji'`). */
  glyphs?: string;
  /** Si se marca, desmarca las demás (y al revés): por ejemplo "lo conversamos en privado". */
  exclusive?: boolean;
}

export type BriefVisual = 'palette' | 'font' | 'ambiente' | 'frame' | 'emoji' | 'roll';

/** Campo de texto corto de una pregunta de campos (nombre, fecha, frase...). */
export interface BriefField {
  id: string;
  label: string;
  placeholder?: string;
}

/**
 * Toda pregunta admite elegir opciones y además escribir una nota libre.
 * `selection` decide cuántas opciones se pueden elegir. `visual` dice cómo se
 * dibuja cada opción (con la paleta, la tipografía y los textos ya elegidos).
 * Una pregunta con `fields` pide textos cortos que alimentan las vistas previas.
 */
export interface BriefQuestion {
  id: string;
  title: string;
  help?: string;
  selection: 'single' | 'multi';
  /** Tope de opciones en una pregunta múltiple; al pasarse, se suelta la más antigua. */
  max?: number;
  options: BriefOption[];
  visual?: BriefVisual;
  fields?: BriefField[];
  notePlaceholder?: string;
}

/**
 * Un formulario de opciones para el cliente de un cumpleaños. Cada cliente
 * tiene su archivo en src/briefs/<slug>.ts con un `export default`; el
 * registro los descubre solos. El motor (ClientBriefPage) es genérico.
 */
export interface BriefDefinition {
  slug: string;
  title: string;
  intro: string;
  questions: BriefQuestion[];
}
