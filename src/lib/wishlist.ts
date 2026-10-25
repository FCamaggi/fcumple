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
}

export type WishlistDisplayMode = 'chip' | 'card' | 'banner';

export interface WishlistConfig {
  enabled: boolean;
  title?: string;
  displayMode: WishlistDisplayMode;
  items: WishlistItem[];
}

export const DEFAULT_WISHLIST: WishlistConfig = {
  enabled: false,
  title: 'Lista de regalos',
  displayMode: 'chip',
  items: [],
};

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

  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items: WishlistItem[] = [];

  for (const it of rawItems.slice(0, 30)) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    const url = typeof r.url === 'string' ? r.url.trim() : '';
    const itTitle = typeof r.title === 'string' ? r.title.trim() : '';
    if (!url || !itTitle) continue;

    const img = r.image_url ?? r.imageUrl;

    items.push({
      id: typeof r.id === 'string' && r.id ? r.id : Math.random().toString(36).slice(2, 10),
      url,
      title: itTitle.slice(0, 120),
      imageUrl: typeof img === 'string' && img.trim() ? img.trim() : null,
      price: typeof r.price === 'string' && r.price.trim() ? r.price.trim().slice(0, 30) : null,
      notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, 200) : null,
    });
  }

  return {
    enabled,
    title,
    displayMode,
    items,
  };
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
