/**
 * Vista previa del enlace de un evento (`/e/:slug`) para WhatsApp, Telegram,
 * iMessage y otros rastreadores. La web es una SPA estática: todas las rutas
 * devuelven el mismo `index.html`, así que sin esto cualquier enlace mostraría
 * la misma tarjeta. `vercel.json` manda a esta función SOLO las peticiones de
 * rastreadores conocidos (por user-agent); los invitados siguen entrando por el
 * camino estático de siempre, sin pasar por aquí.
 *
 * Es deliberadamente autocontenida (no importa nada de `src`): así no depende
 * de cómo Vercel resuelva módulos en un paquete ESM. Y nunca lanza: ante
 * cualquier fallo responde con la vista previa neutra.
 */

export interface EventMeta {
  name: string;
  startsAt: string | null;
  location: string | null;
}

export interface PageMeta {
  title: string;
  description: string;
  url: string;
}

export const NEUTRAL = {
  title: 'Inscríbete a la fiesta',
  description: 'Entra con tu nombre y toma fotos de la fiesta con la cámara del evento.',
};

/** Zona horaria con la que se escribe la fecha en la vista previa (el servidor no conoce la del invitado). */
const TIME_ZONE = 'America/Santiago';
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600';
const TIMEOUT_MS = 2500;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** "viernes 30 de octubre · 20:30 · Los Pozos 6855. Inscríbete con tu nombre…" */
export function describeEvent(meta: EventMeta): string {
  const parts: string[] = [];
  if (meta.startsAt) {
    const date = new Date(meta.startsAt);
    if (!Number.isNaN(date.getTime())) {
      parts.push(
        new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE }).format(date),
        new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIME_ZONE }).format(date),
      );
    }
  }
  if (meta.location?.trim()) parts.push(meta.location.trim());
  return parts.length === 0 ? NEUTRAL.description : `${parts.join(' · ')}. Inscríbete con tu nombre y toma fotos de la fiesta.`;
}

/** Reemplaza el título y las etiquetas de vista previa de `index.html` por las del evento. */
export function injectMeta(html: string, meta: PageMeta): string {
  const tags = [
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="es_CL" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ].join('\n    ');

  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description)"[^>]*>\s*/gi, '');
  return stripped.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}

/** Documento mínimo para cuando no se puede leer `index.html`: solo sirve a los rastreadores. */
function fallbackDocument(meta: PageMeta): string {
  return injectMeta(
    '<!doctype html><html lang="es"><head><meta charset="UTF-8" /><title></title></head><body></body></html>',
    meta,
  );
}

/** Lo mínimo que se usa de `fetch` (así se puede probar sin red). */
export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; json?: () => Promise<unknown>; text?: () => Promise<string> }>;

export interface RenderOptions {
  slug: string;
  /** `https://dominio`, sin barra final. */
  origin: string;
  supabaseUrl: string;
  anonKey: string;
  fetchImpl?: FetchLike;
}

export interface RenderedPage {
  status: number;
  headers: Record<string, string>;
  body: string;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function loadEvent(opts: RenderOptions, fetchImpl: FetchLike): Promise<EventMeta | null> {
  if (!SLUG.test(opts.slug) || opts.slug.length > 60 || !opts.supabaseUrl || !opts.anonKey) return null;
  try {
    const response = await withTimeout((signal) =>
      fetchImpl(`${opts.supabaseUrl}/rest/v1/rpc/get_event_public`, {
        method: 'POST',
        headers: { apikey: opts.anonKey, authorization: `Bearer ${opts.anonKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ p_slug: opts.slug }),
        signal,
      }),
    );
    if (!response.ok) return null;
    const rows = (await response.json?.()) as Array<{ name?: string; starts_at?: string | null; location?: string | null }>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || typeof row.name !== 'string' || !row.name.trim()) return null;
    return { name: row.name.trim(), startsAt: row.starts_at ?? null, location: row.location ?? null };
  } catch {
    return null;
  }
}

async function loadIndex(origin: string, fetchImpl: FetchLike): Promise<string | null> {
  try {
    const response = await withTimeout((signal) => fetchImpl(`${origin}/index.html`, { signal }));
    return response.ok ? ((await response.text?.()) ?? null) : null;
  } catch {
    return null;
  }
}

export async function renderEventPage(opts: RenderOptions): Promise<RenderedPage> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  const event = await loadEvent(opts, fetchImpl);
  const meta: PageMeta = {
    title: event ? event.name : NEUTRAL.title,
    description: event ? describeEvent(event) : NEUTRAL.description,
    url: SLUG.test(opts.slug) ? `${opts.origin}/e/${opts.slug}` : opts.origin,
  };
  const index = await loadIndex(opts.origin, fetchImpl);
  return {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': CACHE_CONTROL },
    body: index ? injectMeta(index, meta) : fallbackDocument(meta),
  };
}

// --- Adaptador de Vercel -------------------------------------------------------

interface Req {
  query?: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  send(body: string): void;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function handler(req: Req, res: Res): Promise<void> {
  let page: RenderedPage;
  try {
    const host = first(req.headers['x-forwarded-host']) || first(req.headers.host);
    const proto = first(req.headers['x-forwarded-proto']) || 'https';
    page = await renderEventPage({
      slug: first(req.query?.slug),
      origin: host ? `${proto}://${host}` : '',
      supabaseUrl: process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
      anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
    });
  } catch {
    page = {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: fallbackDocument({ ...NEUTRAL, url: '' }),
    };
  }
  for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value);
  res.status(page.status).send(page.body);
}
