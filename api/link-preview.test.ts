import { describe, expect, it } from 'vitest';
import handler, {
  extractLinkPreview,
  isSafeUrl,
  parseDescription,
  parseImage,
  parseTitle,
  type FetchLike,
} from './link-preview';

describe('link-preview: seguridad y validación de URLs (SSRF)', () => {
  it('acepta URLs públicas http y https', () => {
    expect(isSafeUrl('https://paris.cl/camara')).toBe(true);
    expect(isSafeUrl('http://amazon.com/dp/123')).toBe(true);
    expect(isSafeUrl('https://articulo.mercadolibre.cl/MLC-123')).toBe(true);
  });

  it('rechaza protocolos no web', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('ftp://ftp.example.com')).toBe(false);
  });

  it('rechaza IPs locales y privadas (prevención de SSRF)', () => {
    expect(isSafeUrl('http://localhost:3000')).toBe(false);
    expect(isSafeUrl('http://127.0.0.1:8080')).toBe(false);
    expect(isSafeUrl('http://10.0.0.1/admin')).toBe(false);
    expect(isSafeUrl('http://192.168.1.1')).toBe(false);
    expect(isSafeUrl('http://172.16.0.1')).toBe(false);
    expect(isSafeUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafeUrl('http://0.0.0.0')).toBe(false);
    expect(isSafeUrl('http://[::1]')).toBe(false);
  });
});

describe('link-preview: parseo de metadatos OpenGraph y HTML', () => {
  it('extrae título desde og:title o <title>', () => {
    const htmlOg = '<html><head><meta property="og:title" content="Cámara Instax &amp; Rollos" /></head></html>';
    expect(parseTitle(htmlOg)).toBe('Cámara Instax & Rollos');

    const htmlRegular = '<html><head><title>Título Simple - Tienda</title></head></html>';
    expect(parseTitle(htmlRegular)).toBe('Título Simple - Tienda');
  });

  it('extrae imagen desde og:image o twitter:image y resuelve URLs relativas', () => {
    const htmlOg = '<html><head><meta property="og:image" content="/images/foto.jpg" /></head></html>';
    expect(parseImage(htmlOg, 'https://tienda.cl/producto/1')).toBe('https://tienda.cl/images/foto.jpg');

    const htmlTw = '<html><head><meta name="twitter:image" content="https://img.cdn.com/item.png" /></head></html>';
    expect(parseImage(htmlTw, 'https://tienda.cl/')).toBe('https://img.cdn.com/item.png');
  });

  it('extrae descripción desde og:description o meta description', () => {
    const html = '<html><head><meta name="description" content="Gran regalo para cumpleaños" /></head></html>';
    expect(parseDescription(html)).toBe('Gran regalo para cumpleaños');
  });
});

describe('link-preview: extractLinkPreview con mock de red', () => {
  it('extrae título e imagen de un HTML mockeado', async () => {
    const mockHtml = `
      <!doctype html>
      <html>
        <head>
          <meta property="og:title" content="Cámara Instantánea Mini" />
          <meta property="og:image" content="https://tienda.cl/preview.jpg" />
          <meta property="og:description" content="Color lila con pack de 20 fotos" />
        </head>
        <body>Contenido</body>
      </html>
    `;

    const mockFetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
      text: async () => mockHtml,
    });

    const result = await extractLinkPreview('https://tienda.cl/regalo', mockFetch);
    expect(result.title).toBe('Cámara Instantánea Mini');
    expect(result.imageUrl).toBe('https://tienda.cl/preview.jpg');
    expect(result.description).toBe('Color lila con pack de 20 fotos');
  });

  it('detecta URLs que son directamente imágenes', async () => {
    const mockFetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
      text: async () => '',
    });

    const result = await extractLinkPreview('https://cdn.fotos.com/foto123.jpg', mockFetch);
    expect(result.title).toBe('Imagen adjunta');
    expect(result.imageUrl).toBe('https://cdn.fotos.com/foto123.jpg');
  });

  it('si el fetch falla devuelve fallback con el hostname sin lanzar', async () => {
    const failingFetch: FetchLike = async () => {
      throw new Error('Network error');
    };

    const result = await extractLinkPreview('https://sitio-caido.com/producto', failingFetch);
    expect(result.title).toBe('sitio-caido.com');
    expect(result.imageUrl).toBeNull();
  });
});

describe('link-preview: handler serverless', () => {
  it('responde 400 si falta el parámetro url', async () => {
    let statusCode = 0;
    let jsonResult: unknown = null;

    const req = { query: {} };
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader() {},
      json(data: unknown) {
        jsonResult = data;
      },
    };

    await handler(req, res);
    expect(statusCode).toBe(400);
    expect(jsonResult).toMatchObject({ error: expect.stringContaining('url') });
  });

  it('responde 400 si la url es insegura (SSRF)', async () => {
    let statusCode = 0;
    let jsonResult: unknown = null;

    const req = { query: { url: 'http://127.0.0.1:9000/secret' } };
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader() {},
      json(data: unknown) {
        jsonResult = data;
      },
    };

    await handler(req, res);
    expect(statusCode).toBe(400);
    expect(jsonResult).toMatchObject({ error: expect.stringContaining('no permitida') });
  });
});
