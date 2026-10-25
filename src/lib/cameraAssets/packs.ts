/**
 * Paquetes de recursos (`packs`), referencias `pack:<pack-id>/<asset-id>`,
 * roles de color (`$acento`, `$fondo`, `$texto`) y recoloreo seguro de SVG
 * mediante `data:image/svg+xml;utf8,...` (sin `blob:`, para no contaminar el
 * `<canvas>` en Safari iOS).
 *
 * Preparación de la Etapa 2.1 del Estudio de Diseño (post-fiesta 30-oct).
 */

import type { ValidationResult } from './frames';
import type { Layer } from './layers';

export const COLOR_ROLES = ['$acento', '$fondo', '$texto'] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

export interface PackPalette {
  acento: string;
  fondo: string;
  texto: string;
}

export type PackAssetCategory = 'ilustracion' | 'marco' | 'tipografia' | 'sello';
export type PackAssetFormat = 'svg' | 'webp' | 'png';

export interface PackAssetLicense {
  /** Origen del recurso (ej. "Generación propia en ChatGPT Plus + vtracer"). */
  source: string;
  /** Identificador de licencia (ej. "Own-Commercial", "MIT", "CC0-1.0"). */
  spdx: string;
  /** Fecha de incorporación YYYY-MM-DD. */
  date: string;
}

export interface PackAssetMeta {
  id: string;
  name: string;
  category: PackAssetCategory;
  file: string;
  format: PackAssetFormat;
  recolorable: boolean;
  tags?: string[];
  license: PackAssetLicense;
}

export interface PackPreset {
  id: string;
  label: string;
  description?: string;
  /** Capas del preset; los colores pueden ser `#RRGGBB` o un rol (`$acento`, `$fondo`, `$texto`). */
  layers: Record<string, unknown>[];
}

export interface PackManifest {
  id: string;
  name: string;
  version: number;
  /** `public`: disponible para cualquier organizador; `private`: exclusivo de `eventSlug`. */
  visibility: 'public' | 'private';
  eventSlug?: string;
  palette: PackPalette;
  assets: PackAssetMeta[];
  presets: PackPreset[];
}

export const MAX_SVG_BYTES = 60 * 1024;
export const MAX_RASTER_BYTES = 120 * 1024;
export const MAX_PACK_BYTES = 2 * 1024 * 1024;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,49}$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]{0,63}\.(svg|webp|png)$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ASSET_REF_RE = /^pack:([a-z0-9][a-z0-9-]{0,49})\/([a-z0-9][a-z0-9-]{0,49})$/;

/** Descompone una referencia `'pack:halloween-neon/murcielago'` en `{ packId, assetId }`. */
export function parseAssetRef(ref: unknown): { packId: string; assetId: string } | null {
  if (typeof ref !== 'string') return null;
  const match = ASSET_REF_RE.exec(ref);
  if (!match) return null;
  return { packId: match[1], assetId: match[2] };
}

/** Devuelve `true` si el valor es un `#RRGGBB` o uno de los tres roles (`$acento`, `$fondo`, `$texto`). */
export function isRoleOrHexColor(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return HEX_COLOR_RE.test(value) || (COLOR_ROLES as readonly string[]).includes(value);
}

/** Sustituye un rol (`$acento`, `$fondo`, `$texto`) por el `#RRGGBB` de la paleta; deja intacto un `#RRGGBB`. */
export function resolveRoleColor(value: string | undefined, palette: PackPalette): string | undefined {
  if (!value) return value;
  if (value === '$acento') return palette.acento;
  if (value === '$fondo') return palette.fondo;
  if (value === '$texto') return palette.texto;
  return value;
}

/**
 * Sustituye los roles de color (`$acento`, `$fondo`, `$texto` y `currentColor`) en el texto de un SVG
 * y devuelve un `data:image/svg+xml;utf8,...` listo para cargar en `Image`.
 *
 * Reglas comprobadas en `prueba-recursos-ia.md`:
 * 1. El SVG debe conservar `xmlns="http://www.w3.org/2000/svg"` (sin él `drawImage` falla).
 * 2. Se prohíben `<script>`, `<foreignObject>` y atributos `on*`.
 * 3. Se usa `data:` URI y no `blob:` para evitar que Safari de iOS contamine el `<canvas>`.
 */
export function recolorSvgToDataUri(svgText: string, palette: PackPalette): string {
  if (!svgText.includes('xmlns="http://www.w3.org/2000/svg"')) {
    throw new Error('El SVG debe incluir xmlns="http://www.w3.org/2000/svg" para decodificarse como imagen.');
  }
  if (/<script\b|<foreignObject\b|\bon[a-z]+\s*=/i.test(svgText)) {
    throw new Error('El SVG contiene etiquetas o atributos no permitidos.');
  }

  const colored = svgText
    .replaceAll('$acento', palette.acento)
    .replaceAll('$fondo', palette.fondo)
    .replaceAll('$texto', palette.texto)
    .replaceAll('currentColor', palette.acento);

  return `data:image/svg+xml;utf8,${encodeURIComponent(colored)}`;
}

/**
 * Copia las capas de un preset al diseño de un evento resolviendo los roles
 * `$acento`, `$fondo` y `$texto` a colores `#RRGGBB` concretos.
 */
export function materializePresetLayers(
  preset: PackPreset,
  basePalette: PackPalette,
  overrides?: Partial<PackPalette>,
): Layer[] {
  const palette: PackPalette = { ...basePalette, ...overrides };
  return preset.layers.map((raw) => {
    const next: Record<string, unknown> = { ...raw };
    for (const key of ['color', 'strokeColor', 'fill', 'stroke', 'tint'] as const) {
      if (typeof next[key] === 'string') {
        next[key] = resolveRoleColor(next[key] as string, palette);
      }
    }
    if (next.shadow && typeof next.shadow === 'object' && next.shadow !== null) {
      const sh = { ...(next.shadow as Record<string, unknown>) };
      if (typeof sh.color === 'string') {
        sh.color = resolveRoleColor(sh.color, palette);
      }
      next.shadow = sh;
    }
    return next as unknown as Layer;
  });
}

/** Valida un manifiesto `pack.json` antes de servirlo o en CI. */
export function validatePackManifest(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'El manifiesto del paquete debe ser un objeto.' };
  }
  const m = raw as Record<string, unknown>;

  if (typeof m.id !== 'string' || !SLUG_RE.test(m.id)) {
    return { ok: false, error: 'El id del paquete no es válido.' };
  }
  if (typeof m.name !== 'string' || m.name.trim().length === 0 || m.name.length > 80) {
    return { ok: false, error: 'El nombre del paquete no es válido.' };
  }
  if (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1) {
    return { ok: false, error: 'La versión del paquete debe ser un entero >= 1.' };
  }
  if (m.visibility !== 'public' && m.visibility !== 'private') {
    return { ok: false, error: 'La visibilidad debe ser public o private.' };
  }
  if (m.visibility === 'private' && (typeof m.eventSlug !== 'string' || !SLUG_RE.test(m.eventSlug))) {
    return { ok: false, error: 'Un paquete privado debe indicar su eventSlug.' };
  }

  const pal = m.palette as Record<string, unknown> | undefined;
  if (
    !pal ||
    typeof pal !== 'object' ||
    !HEX_COLOR_RE.test(String(pal.acento ?? '')) ||
    !HEX_COLOR_RE.test(String(pal.fondo ?? '')) ||
    !HEX_COLOR_RE.test(String(pal.texto ?? ''))
  ) {
    return { ok: false, error: 'La paleta del paquete debe definir acento, fondo y texto como #RRGGBB.' };
  }

  if (!Array.isArray(m.assets) || m.assets.length === 0) {
    return { ok: false, error: 'El paquete debe declarar al menos un recurso en assets.' };
  }

  const seenAssets = new Set<string>();
  for (const item of m.assets) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: 'Recurso inválido en assets.' };
    }
    const a = item as Record<string, unknown>;
    if (typeof a.id !== 'string' || !SLUG_RE.test(a.id)) {
      return { ok: false, error: `Id de recurso inválido: ${String(a.id)}.` };
    }
    if (seenAssets.has(a.id)) {
      return { ok: false, error: `Recurso duplicado en el paquete: ${a.id}.` };
    }
    seenAssets.add(a.id);

    if (typeof a.name !== 'string' || a.name.trim().length === 0) {
      return { ok: false, error: `El recurso ${a.id} no tiene nombre.` };
    }
    if (!['ilustracion', 'marco', 'tipografia', 'sello'].includes(String(a.category))) {
      return { ok: false, error: `Categoría inválida en el recurso ${a.id}.` };
    }
    if (typeof a.file !== 'string' || !FILE_RE.test(a.file)) {
      return { ok: false, error: `Archivo inválido en el recurso ${a.id}.` };
    }
    if (!['svg', 'webp', 'png'].includes(String(a.format)) || !a.file.endsWith(`.${String(a.format)}`)) {
      return { ok: false, error: `El formato del recurso ${a.id} no coincide con su extensión.` };
    }
    if (typeof a.recolorable !== 'boolean') {
      return { ok: false, error: `El recurso ${a.id} debe indicar si es recoloreable.` };
    }
    const lic = a.license as Record<string, unknown> | undefined;
    if (
      !lic ||
      typeof lic !== 'object' ||
      typeof lic.source !== 'string' ||
      lic.source.trim().length === 0 ||
      typeof lic.spdx !== 'string' ||
      lic.spdx.trim().length === 0 ||
      typeof lic.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(lic.date)
    ) {
      return { ok: false, error: `El recurso ${a.id} debe declarar su licencia completa (source, spdx, date).` };
    }
  }

  if (!Array.isArray(m.presets)) {
    return { ok: false, error: 'El paquete debe incluir la lista presets.' };
  }

  return { ok: true };
}
