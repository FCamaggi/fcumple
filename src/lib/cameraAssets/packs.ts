/**
 * Paquetes de recursos (`packs`), referencias `pack:<pack-id>/<asset-id>`,
 * roles de color (`$acento`, `$fondo`, `$texto`) y recoloreo seguro de SVG
 * mediante `data:image/svg+xml;utf8,...` (sin `blob:`, para no contaminar el
 * `<canvas>` en Safari iOS).
 *
 * Preparación de la Etapa 2.1 del Estudio de Diseño (post-fiesta 30-oct).
 */

import halloweenNeonPackJson from '../../../public/packs/halloween-neon/pack.json';
import type { ValidationResult } from './frames';
import type { Layer } from './layers';

export const DEFAULT_PACK_PALETTE: PackPalette = {
  acento: '#ff2f92',
  fondo: '#0d0b12',
  texto: '#ffffff',
};

export const PALETTE_PRESETS: Array<{ id: string; label: string; palette: PackPalette }> = [
  { id: 'neon-fucsia', label: 'Neón Fucsia', palette: { acento: '#ff2f92', fondo: '#0d0b12', texto: '#ffffff' } },
  { id: 'acido-lima', label: 'Ácido Lima', palette: { acento: '#c8f23a', fondo: '#0d0b12', texto: '#ffffff' } },
  { id: 'naranja-halloween', label: 'Calabaza Neón', palette: { acento: '#ff6b00', fondo: '#120b0d', texto: '#fff5eb' } },
  { id: 'cian-electrico', label: 'Cian Eléctrico', palette: { acento: '#4fc3ff', fondo: '#0b1016', texto: '#ffffff' } },
  { id: 'violeta-bruja', label: 'Violeta Bruja', palette: { acento: '#9b6bff', fondo: '#110b1a', texto: '#f5efff' } },
];

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

export interface PackManifest {
  id: string;
  name: string;
  version: number;
  /** `public`: disponible para cualquier organizador; `private`: exclusivo de `eventSlug`. */
  visibility: 'public' | 'private';
  eventSlug?: string;
  palette: PackPalette;
  assets: PackAssetMeta[];
}

export const MAX_SVG_BYTES = 60 * 1024;
export const MAX_RASTER_BYTES = 120 * 1024;
export const MAX_PACK_BYTES = 2 * 1024 * 1024;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,49}$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]{0,63}\.(svg|webp|png)$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ASSET_REF_RE = /^pack:([a-z0-9][a-z0-9-]{0,49})\/([a-z0-9][a-z0-9-]{0,49})$/;
const ASSET_KEY_RE = /^pack:([a-z0-9][a-z0-9-]{0,49})\/([a-z0-9][a-z0-9-]{0,49})(?:@(#[0-9a-fA-F]{6}))?$/;

/** Descompone una referencia `'pack:halloween-neon/murcielago'` en `{ packId, assetId }`. */
export function parseAssetRef(ref: unknown): { packId: string; assetId: string } | null {
  if (typeof ref !== 'string') return null;
  const match = ASSET_REF_RE.exec(ref);
  if (!match) return null;
  return { packId: match[1], assetId: match[2] };
}

/** Descompone una clave de caché `'pack:halloween-neon/murcielago@#ff2f92'` en `{ packId, assetId, tint }`. */
export function parseAssetKey(key: unknown): { packId: string; assetId: string; tint?: string } | null {
  if (typeof key !== 'string') return null;
  const match = ASSET_KEY_RE.exec(key);
  if (!match) return null;
  return {
    packId: match[1],
    assetId: match[2],
    ...(match[3] ? { tint: match[3].toLowerCase() } : {}),
  };
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
 * Cambia en bloque los colores de las capas actuales cuando el organizador actualiza
 * la paleta de 3 roles (`$acento`, `$fondo`, `$texto`).
 */
export function recolorLayersByPalette(
  layers: readonly Layer[],
  prevPalette: PackPalette,
  nextPalette: PackPalette,
): Layer[] {
  const mapColor = (val: string | undefined): string | undefined => {
    if (!val) return val;
    const lower = val.toLowerCase();
    if (lower === prevPalette.acento.toLowerCase() || val === '$acento') return nextPalette.acento;
    if (lower === prevPalette.fondo.toLowerCase() || val === '$fondo') return nextPalette.fondo;
    if (lower === prevPalette.texto.toLowerCase() || val === '$texto') return nextPalette.texto;
    return val;
  };

  return layers.map((layer) => {
    const next: Record<string, unknown> = { ...layer };
    for (const key of ['color', 'strokeColor', 'fill', 'stroke', 'tint'] as const) {
      if (typeof next[key] === 'string') {
        next[key] = mapColor(next[key] as string);
      }
    }
    if (layer.type === 'asset' && !next.tint && prevPalette.acento.toLowerCase() !== nextPalette.acento.toLowerCase()) {
      next.tint = nextPalette.acento;
    }
    if (next.shadow && typeof next.shadow === 'object' && next.shadow !== null) {
      const sh = { ...(next.shadow as Record<string, unknown>) };
      if (typeof sh.color === 'string') {
        sh.color = mapColor(sh.color);
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

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Caché y resolución de recursos estáticos (/packs/<pack-id>/...)
// ---------------------------------------------------------------------------

const BUILTIN_PACKS: readonly PackManifest[] = [halloweenNeonPackJson as unknown as PackManifest];

const manifestCache = new Map<string, PackManifest>();
const svgTextCache = new Map<string, string>();
const resolvedAssetUriCache = new Map<string, string>();
const loadedAssetImageCache = new Map<string, CanvasImageSource>();

function seedBuiltinPacks(): void {
  for (const pack of BUILTIN_PACKS) {
    if (!manifestCache.has(pack.id)) {
      manifestCache.set(pack.id, pack);
    }
  }
}

seedBuiltinPacks();

/** Registra un manifiesto en memoria (útil para tests o precarga de catálogo). */
export function registerPackManifest(manifest: PackManifest): void {
  manifestCache.set(manifest.id, manifest);
}

/** Registra el texto crudo de un SVG de un paquete en la caché en memoria. */
export function registerPackSvg(packId: string, file: string, svgText: string): void {
  svgTextCache.set(`/packs/${packId}/${file}`, svgText);
}

export function getCachedPackAssetImage(assetKey: string): CanvasImageSource | undefined {
  return loadedAssetImageCache.get(assetKey);
}

export function setCachedPackAssetImage(assetKey: string, img: CanvasImageSource): void {
  loadedAssetImageCache.set(assetKey, img);
}

/** Limpia todas las cachés en memoria de paquetes y recursos. */
export function clearPackAssetCache(): void {
  manifestCache.clear();
  svgTextCache.clear();
  resolvedAssetUriCache.clear();
  loadedAssetImageCache.clear();
  seedBuiltinPacks();
}

/**
 * Devuelve sincrónicamente los paquetes ya cargados en memoria para el evento.
 */
export function getCachedPacksForEvent(eventSlug?: string): PackManifest[] {
  seedBuiltinPacks();
  const packs: PackManifest[] = [];
  for (const pack of manifestCache.values()) {
    if (pack.visibility === 'public') {
      packs.push(pack);
    } else if (pack.visibility === 'private' && eventSlug && pack.eventSlug === eventSlug) {
      packs.push(pack);
    }
  }
  return packs;
}

/**
 * Devuelve los paquetes disponibles para un evento: todos los paquetes `visibility: 'public'`
 * más los paquetes `visibility: 'private'` cuyo `eventSlug` coincida con `eventSlug`.
 */
export async function loadPacksForEvent(
  eventSlug?: string,
  extraPackIds: readonly string[] = [],
  fetcher: typeof fetch = fetch,
): Promise<PackManifest[]> {
  seedBuiltinPacks();
  const ids = new Set<string>([...manifestCache.keys(), ...extraPackIds]);
  const results = await Promise.allSettled(Array.from(ids).map((id) => fetchPackManifest(id, fetcher)));
  const packs: PackManifest[] = [];
  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    const pack = res.value;
    if (pack.visibility === 'public') {
      packs.push(pack);
    } else if (pack.visibility === 'private' && eventSlug && pack.eventSlug === eventSlug) {
      packs.push(pack);
    }
  }
  return packs;
}

async function fetchPackManifest(packId: string, fetcher: typeof fetch): Promise<PackManifest> {
  const cached = manifestCache.get(packId);
  if (cached) return cached;
  const res = await fetcher(`/packs/${packId}/pack.json`);
  if (!res.ok) {
    throw new Error(`No se pudo cargar el paquete ${packId} (${res.status}).`);
  }
  const raw = (await res.json()) as unknown;
  const check = validatePackManifest(raw);
  if (!check.ok) {
    throw new Error(check.error);
  }
  const manifest = raw as PackManifest;
  manifestCache.set(packId, manifest);
  return manifest;
}

async function fetchPackSvgText(url: string, fetcher: typeof fetch): Promise<string> {
  const cached = svgTextCache.get(url);
  if (cached !== undefined) return cached;
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`No se pudo cargar el recurso ${url} (${res.status}).`);
  }
  const text = await res.text();
  svgTextCache.set(url, text);
  return text;
}

/**
 * Resuelve una clave de capa `asset` (`'pack:<pack-id>/<asset-id>'` o `'pack:<pack-id>/<asset-id>@#rrggbb'`)
 * a una URL lista para `Image.src` (un `data:image/svg+xml;utf8,...` recoloreado si es SVG recoloreable,
 * o la ruta estática `/packs/<pack-id>/<archivo>` del mismo origen, 0 egress de Supabase).
 */
export async function resolvePackAssetUrl(assetKey: string, fetcher: typeof fetch = fetch): Promise<string> {
  const cachedUri = resolvedAssetUriCache.get(assetKey);
  if (cachedUri) return cachedUri;

  const parsed = parseAssetKey(assetKey);
  if (!parsed) {
    throw new Error(`Referencia de recurso inválida: ${assetKey}`);
  }

  const { packId, assetId, tint } = parsed;
  const manifest = await fetchPackManifest(packId, fetcher);
  const assetMeta = manifest.assets.find((a) => a.id === assetId);
  if (!assetMeta) {
    throw new Error(`El recurso ${assetId} no existe en el paquete ${packId}.`);
  }

  const staticUrl = `/packs/${packId}/${assetMeta.file}`;
  if (assetMeta.format === 'svg' && assetMeta.recolorable) {
    const svgText = await fetchPackSvgText(staticUrl, fetcher);
    const palette: PackPalette = tint ? { ...manifest.palette, acento: tint } : manifest.palette;
    const dataUri = recolorSvgToDataUri(svgText, palette);
    resolvedAssetUriCache.set(assetKey, dataUri);
    return dataUri;
  }

  resolvedAssetUriCache.set(assetKey, staticUrl);
  return staticUrl;
}
