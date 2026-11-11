/**
 * Tipos y utilidades para la lista de deseos / regalos del evento (Wishlist).
 */

export interface WishlistItem {
  id: string;
  url: string;
  title: string;
  imageUrl?: string | null;
  price?: string | null;
  notes?: string | null;
  /** A quién va el regalo (ids de `honorees`). Vacío: es para todos. */
  honoreeIds: string[];
}

/** Festejado de la lista: solo un nombre visible, sin datos de cuentas. */
export interface WishlistHonoree {
  id: string;
  name: string;
}

export const WISHLIST_LIMITS = {
  items: 30,
  honorees: 6,
  honoreeName: 40,
} as const;

export type WishlistDisplayMode = 'chip' | 'card' | 'banner';

export interface WishlistConfig {
  enabled: boolean;
  title?: string;
  displayMode: WishlistDisplayMode;
  /** Festejados (eventos de varios cumpleañeros). Vacío: la lista no se separa por persona. */
  honorees: WishlistHonoree[];
  items: WishlistItem[];
}

export const DEFAULT_WISHLIST: WishlistConfig = {
  enabled: false,
  title: 'Lista de regalos',
  displayMode: 'chip',
  honorees: [],
  items: [],
};

function resolveHonorees(raw: unknown): WishlistHonoree[] {
  if (!Array.isArray(raw)) return [];
  const out: WishlistHonoree[] = [];
  for (const h of raw) {
    if (out.length >= WISHLIST_LIMITS.honorees) break;
    if (!h || typeof h !== 'object') continue;
    const r = h as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, WISHLIST_LIMITS.honoreeName) : '';
    if (!id || !name || out.some((o) => o.id === id)) continue;
    out.push({ id, name });
  }
  return out;
}

/**
 * Normaliza cualquier valor proveniente de la base de datos o APIs en un
 * objeto WishlistConfig seguro y bien formado.
 */
export function resolveWishlist(raw: unknown): WishlistConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_WISHLIST };
  }

  const obj = raw as Record<string, unknown>;
  const enabled = Boolean(obj.enabled);
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim().slice(0, 60) : 'Lista de regalos';
  const mode = obj.display_mode ?? obj.displayMode;
  const displayMode: WishlistDisplayMode = mode === 'card' || mode === 'banner' ? mode : 'chip';

  const honorees = resolveHonorees(obj.honorees);
  const known = new Set(honorees.map((h) => h.id));

  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items: WishlistItem[] = [];

  for (const it of rawItems.slice(0, WISHLIST_LIMITS.items)) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    const url = typeof r.url === 'string' ? r.url.trim() : '';
    const itTitle = typeof r.title === 'string' ? r.title.trim() : '';
    if (!url || !itTitle) continue;

    const img = r.image_url ?? r.imageUrl;
    const rawIds = r.honoree_ids ?? r.honoreeIds;
    const honoreeIds = Array.isArray(rawIds)
      ? [...new Set(rawIds.filter((x): x is string => typeof x === 'string' && known.has(x)))]
      : [];

    items.push({
      id: typeof r.id === 'string' && r.id ? r.id : Math.random().toString(36).slice(2, 10),
      url,
      title: itTitle.slice(0, 120),
      imageUrl: typeof img === 'string' && img.trim() ? img.trim() : null,
      price: typeof r.price === 'string' && r.price.trim() ? r.price.trim().slice(0, 30) : null,
      notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, 200) : null,
      honoreeIds,
    });
  }

  return {
    enabled,
    title,
    displayMode,
    honorees,
    items,
  };
}

/**
 * Forma que guarda `events.wishlist` (la valida `valid_event_wishlist` en la base): claves en snake_case
 * y sin los campos opcionales vacíos.
 */
export function serializeWishlist(config: WishlistConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {
    enabled: config.enabled,
    title: config.title?.trim() || 'Lista de regalos',
    display_mode: config.displayMode,
  };
  if (config.honorees.length > 0) {
    out.honorees = config.honorees.map((h) => ({ id: h.id, name: h.name.trim() }));
  }
  out.items = config.items.map((it) => {
    const row: Record<string, unknown> = { id: it.id, url: it.url, title: it.title };
    if (it.imageUrl) row.image_url = it.imageUrl;
    if (it.price) row.price = it.price;
    if (it.notes) row.notes = it.notes;
    if (it.honoreeIds.length > 0) row.honoree_ids = it.honoreeIds;
    return row;
  });
  return out;
}

export interface WishlistGroup {
  /** Título del grupo ("Para Nacho"); `null` cuando la lista no se separa por persona. */
  label: string | null;
  items: WishlistItem[];
}

/** "Nacho", "Nacho y Cata", "Nacho, Grazia y Cata". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/**
 * Agrupa los regalos para el invitado: primero los de cada festejado (en el orden de la lista de
 * festejados), después los compartidos por algunos y al final los que son para todos (sin asignar o
 * asignados a todos). Sin festejados, un solo grupo sin título.
 */
export function groupWishlistItems(config: WishlistConfig): WishlistGroup[] {
  const { honorees, items } = config;
  if (honorees.length === 0) return items.length > 0 ? [{ label: null, items }] : [];

  const order = new Map(honorees.map((h, i) => [h.id, i]));
  const forAll: WishlistItem[] = [];
  const byKey = new Map<string, { ids: string[]; items: WishlistItem[] }>();

  for (const item of items) {
    const ids = [...item.honoreeIds].sort((a, b) => order.get(a)! - order.get(b)!);
    if (ids.length === 0 || ids.length === honorees.length) {
      forAll.push(item);
      continue;
    }
    const key = ids.join('|');
    const group = byKey.get(key) ?? { ids, items: [] };
    group.items.push(item);
    byKey.set(key, group);
  }

  const name = (id: string) => honorees[order.get(id)!].name;
  const groups = [...byKey.values()]
    .sort((a, b) => a.ids.length - b.ids.length || order.get(a.ids[0])! - order.get(b.ids[0])!)
    .map((g) => ({ label: `Para ${joinNames(g.ids.map(name))}`, items: g.items }));

  if (forAll.length > 0) groups.push({ label: 'Para todos', items: forAll });
  return groups;
}

/**
 * Consulta la función serverless `/api/link-preview` para extraer metadatos
 * (título e imagen OpenGraph) de un enlace.
 */
export async function fetchLinkPreview(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ title: string; imageUrl: string | null; description: string | null }> {
  try {
    const res = await fetchImpl(`/api/link-preview?url=${encodeURIComponent(rawUrl.trim())}`);
    if (res.ok) {
      const data = (await res.json()) as { title?: unknown; imageUrl?: unknown; description?: unknown };
      return {
        title: typeof data.title === 'string' ? data.title : new URL(rawUrl).hostname,
        imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : null,
        description: typeof data.description === 'string' ? data.description : null,
      };
    }
  } catch {
    // Si la llamada falla, cae a fallback con el hostname
  }

  try {
    return {
      title: new URL(rawUrl).hostname,
      imageUrl: null,
      description: null,
    };
  } catch {
    return {
      title: 'Enlace de regalo',
      imageUrl: null,
      description: null,
    };
  }
}
