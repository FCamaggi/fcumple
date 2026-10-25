/**
 * Extracción de vista previa de enlaces externos (OpenGraph / Twitter Cards)
 * para la lista de deseos / regalos del evento.
 *
 * Se ejecuta como función serverless en Vercel (`/api/link-preview`) para evitar
 * bloqueos de CORS del navegador al consultar tiendas externas (Amazon, Paris,
 * MercadoLibre, Falabella, etc.).
 *
 * Incluye protección estricta contra SSRF (bloquea IPs privadas y de loopback).
 */

export interface LinkPreviewResult {
  url: string;
  title: string;
  imageUrl: string | null;
  description: string | null;
}

export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text?: () => Promise<string>;
}>;

const TIMEOUT_MS = 3500;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Expresión para detectar IPs privadas o de metadatos de nube (SSRF)
const PRIVATE_IP_OR_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[::1\]|.*\.local)$/i;

export function isSafeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (PRIVATE_IP_OR_HOST.test(hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .trim();
}

export function parseMetaTag(html: string, propertyOrName: string): string | null {
  // Busca <meta (property|name)="val" content="target"> o <meta content="target" (property|name)="val">
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern1 = new RegExp(
    `<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i',
  );
  const match1 = html.match(pattern1);
  if (match1?.[1]) return decodeHtmlEntities(match1[1]);

  const pattern2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
    'i',
  );
  const match2 = html.match(pattern2);
  if (match2?.[1]) return decodeHtmlEntities(match2[1]);

  return null;
}

export function parseTitle(html: string): string | null {
  const ogTitle = parseMetaTag(html, 'og:title');
  if (ogTitle) return ogTitle;

  const twTitle = parseMetaTag(html, 'twitter:title');
  if (twTitle) return twTitle;

  const matchTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (matchTitle?.[1]) return decodeHtmlEntities(matchTitle[1].replace(/\s+/g, ' '));

  return null;
}

export function parseImage(html: string, baseUrl: string): string | null {
  const candidates = [
    parseMetaTag(html, 'og:image:secure_url'),
    parseMetaTag(html, 'og:image'),
    parseMetaTag(html, 'twitter:image:src'),
    parseMetaTag(html, 'twitter:image'),
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      try {
        const resolved = new URL(candidate.trim(), baseUrl).toString();
        if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
          return resolved;
        }
      } catch {
        // Formato no válido
      }
    }
  }

  // <link rel="image_src" href="...">
  const matchLink = html.match(/<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']*)["'][^>]*>/i);
  if (matchLink?.[1]) {
    try {
      const resolved = new URL(matchLink[1].trim(), baseUrl).toString();
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        return resolved;
      }
    } catch {
      // Formato no válido
    }
  }

  return null;
}

export function parseDescription(html: string): string | null {
  return (
    parseMetaTag(html, 'og:description') ||
    parseMetaTag(html, 'twitter:description') ||
    parseMetaTag(html, 'description')
  );
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

export async function extractLinkPreview(
  rawUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<LinkPreviewResult> {
  if (!isSafeUrl(rawUrl)) {
    throw new Error('URL no permitida o no válida.');
  }

  const normalizedUrl = rawUrl.trim();

  try {
    const response = await withTimeout((signal) =>
      fetchImpl(normalizedUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*;q=0.8,*/*;q=0.7',
          'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
        },
        signal,
      }),
    );

    if (!response.ok) {
      return {
        url: normalizedUrl,
        title: new URL(normalizedUrl).hostname,
        imageUrl: null,
        description: null,
      };
    }

    const contentType = response.headers?.get('content-type') ?? '';
    // Si la URL apunta directamente a una imagen (jpg, png, webp, etc.)
    if (/^image\//i.test(contentType)) {
      return {
        url: normalizedUrl,
        title: 'Imagen adjunta',
        imageUrl: normalizedUrl,
        description: null,
      };
    }

    const html = (await response.text?.()) ?? '';
    const title = parseTitle(html) || new URL(normalizedUrl).hostname;
    const imageUrl = parseImage(html, normalizedUrl);
    const description = parseDescription(html);

    return {
      url: normalizedUrl,
      title: title.slice(0, 120),
      imageUrl,
      description: description ? description.slice(0, 200) : null,
    };
  } catch {
    // Si falla la red o el timeout, devuelve la URL con título del hostname
    return {
      url: normalizedUrl,
      title: new URL(normalizedUrl).hostname,
      imageUrl: null,
      description: null,
    };
  }
}

// --- Adaptador Vercel Serverless Function ---

interface Req {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(data: unknown): void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  let rawUrl = '';
  if (typeof req.query?.url === 'string') {
    rawUrl = req.query.url;
  } else if (req.body && typeof req.body === 'object' && 'url' in req.body && typeof (req.body as { url: unknown }).url === 'string') {
    rawUrl = (req.body as { url: string }).url;
  }

  if (!rawUrl || !rawUrl.trim()) {
    res.status(400).json({ error: 'Debes ingresar una URL válida en el parámetro "url".' });
    return;
  }

  try {
    const preview = await extractLinkPreview(rawUrl);
    res.status(200).json(preview);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar la vista previa.';
    res.status(400).json({ error: msg });
  }
}
