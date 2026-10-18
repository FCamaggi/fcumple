export interface BriefOption {
  id: string;
  label: string;
  hint?: string;
  /** Muestras de color (hex) para opciones de paleta. */
  swatches?: string[];
}

/**
 * Toda pregunta admite elegir opciones y además escribir una nota libre.
 * `selection` decide cuántas opciones se pueden elegir; sin opciones, la
 * pregunta es solo de texto libre.
 */
export interface BriefQuestion {
  id: string;
  title: string;
  help?: string;
  selection: 'single' | 'multi';
  options: BriefOption[];
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
