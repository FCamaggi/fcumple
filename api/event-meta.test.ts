import { describe, expect, it, vi } from 'vitest';
import handler, { NEUTRAL, describeEvent, injectMeta, renderEventPage } from './event-meta';

const INDEX = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Título viejo</title>
    <meta name="description" content="descripción vieja" />
    <meta property="og:title" content="viejo" />
    <meta
      property="og:description"
      content="Viernes 9 de octubre"
    />
    <meta property="og:image" content="https://example.com/viejo.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="viewport" content="width=device-width" />
  </head>
  <body><div id="root"></div></body>
</html>`;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async (): Promise<string> => String(body) });

function fetchStub(event: unknown) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('/rest/v1/rpc/get_event_public')) return ok(event === undefined ? [] : [event]);
    return { ok: true, status: 200, text: async (): Promise<string> => INDEX };
  });
}

const base = {
  slug: 'cumpleanos-fran-j4h7',
  origin: 'https://fcumple.example',
  supabaseUrl: 'https://abc.supabase.co',
  anonKey: 'anon',
};

describe('describeEvent', () => {
  it('arma fecha, hora y lugar en español, en la hora de Chile', () => {
    const text = describeEvent({ name: 'PUTI HALLOWEEN', startsAt: '2026-10-30T23:30:00Z', location: 'Los Pozos 6855' });
    expect(text).toMatch(/30 de octubre/);
    expect(text).toContain('20:30');
    expect(text).toContain('Los Pozos 6855');
    expect(text).toContain('Inscríbete');
  });

  it('sin fecha ni lugar sigue dando una invitación', () => {
    expect(describeEvent({ name: 'X', startsAt: null, location: null })).toBe(NEUTRAL.description);
  });

  it('una fecha inválida se ignora', () => {
    expect(describeEvent({ name: 'X', startsAt: 'no es fecha', location: 'Casa' })).toContain('Casa');
  });
});

describe('injectMeta', () => {
  const out = injectMeta(INDEX, { title: 'PUTI HALLOWEEN', description: 'Hola', url: 'https://fcumple.example/e/x' });

  it('reemplaza el título y las etiquetas de vista previa viejas, incluidas las de varias líneas', () => {
    expect(out).toContain('<title>PUTI HALLOWEEN</title>');
    expect(out).not.toContain('Título viejo');
    expect(out).not.toContain('viejo.jpg');
    expect(out).not.toContain('Viernes 9 de octubre');
    expect(out).not.toContain('summary_large_image');
    expect(out.match(/property="og:title"/g)).toHaveLength(1);
  });

  it('agrega las etiquetas nuevas y conserva el resto del documento', () => {
    expect(out).toContain('<meta property="og:title" content="PUTI HALLOWEEN" />');
    expect(out).toContain('<meta property="og:description" content="Hola" />');
    expect(out).toContain('<meta property="og:url" content="https://fcumple.example/e/x" />');
    expect(out).toContain('<meta name="twitter:card" content="summary" />');
    expect(out).toContain('<meta name="viewport"');
    expect(out).toContain('<div id="root"></div>');
  });

  it('escapa el HTML del nombre del evento', () => {
    const evil = injectMeta(INDEX, { title: '"><script>alert(1)</script>', description: '& <b>', url: 'u' });
    expect(evil).not.toContain('<script>alert(1)</script>');
    expect(evil).toContain('&lt;script&gt;');
    expect(evil).toContain('&amp; &lt;b&gt;');
  });
});

describe('renderEventPage', () => {
  it('pone el nombre, la fecha y el lugar del evento en la vista previa', async () => {
    const fetchImpl = fetchStub({ name: 'PUTI HALLOWEEN', starts_at: '2026-10-30T23:30:00Z', location: 'Los Pozos 6855' });
    const page = await renderEventPage({ ...base, fetchImpl });
    expect(page.status).toBe(200);
    expect(page.body).toContain('<title>PUTI HALLOWEEN</title>');
    expect(page.body).toContain('Los Pozos 6855');
    expect(page.body).toContain('https://fcumple.example/e/cumpleanos-fran-j4h7');
    expect(page.headers['cache-control']).toMatch(/s-maxage=300/);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://abc.supabase.co/rest/v1/rpc/get_event_public',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_slug: 'cumpleanos-fran-j4h7' }) }),
    );
  });

  it('un evento que no existe da la vista previa neutra, no la de otro evento', async () => {
    const page = await renderEventPage({ ...base, fetchImpl: fetchStub(undefined) });
    expect(page.body).toContain(`<title>${NEUTRAL.title}</title>`);
    expect(page.body).not.toContain('Fabrizio');
  });

  it('si Supabase falla o se cae, da la vista previa neutra', async () => {
    const failing = vi.fn(async (url: string) => {
      if (String(url).includes('/rest/v1/')) throw new Error('boom');
      return { ok: true, status: 200, text: async (): Promise<string> => INDEX };
    });
    const page = await renderEventPage({ ...base, fetchImpl: failing });
    expect(page.status).toBe(200);
    expect(page.body).toContain(`<title>${NEUTRAL.title}</title>`);
  });

  it('si Supabase responde con error, da la vista previa neutra', async () => {
    const bad = vi.fn(async (url: string) =>
      String(url).includes('/rest/v1/')
        ? { ok: false, status: 500, json: async () => ({}), text: async (): Promise<string> => '' }
        : { ok: true, status: 200, text: async (): Promise<string> => INDEX },
    );
    const page = await renderEventPage({ ...base, fetchImpl: bad });
    expect(page.body).toContain(`<title>${NEUTRAL.title}</title>`);
  });

  it('sin la clave de Supabase no consulta y da la neutra', async () => {
    const fetchImpl = fetchStub({ name: 'X', starts_at: null, location: null });
    const page = await renderEventPage({ ...base, anonKey: '', fetchImpl });
    expect(page.body).toContain(`<title>${NEUTRAL.title}</title>`);
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining('/rest/v1/'), expect.anything());
  });

  it('un slug inválido no llega a la base', async () => {
    const fetchImpl = fetchStub({ name: 'X', starts_at: null, location: null });
    const page = await renderEventPage({ ...base, slug: "x'; drop table events;--", fetchImpl });
    expect(page.body).toContain(`<title>${NEUTRAL.title}</title>`);
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining('/rest/v1/'), expect.anything());
  });

  it('si ni siquiera se puede leer index.html, devuelve un documento mínimo con la vista previa', async () => {
    const down = vi.fn(async (url: string) => {
      if (String(url).includes('/rest/v1/')) return ok([{ name: 'PUTI HALLOWEEN', starts_at: null, location: null }]);
      throw new Error('sin red');
    });
    const page = await renderEventPage({ ...base, fetchImpl: down });
    expect(page.status).toBe(200);
    expect(page.body).toContain('<title>PUTI HALLOWEEN</title>');
    expect(page.body).toContain('<html');
  });
});

describe('handler', () => {
  function res() {
    const out = { code: 0, headers: {} as Record<string, string>, body: '' };
    return {
      out,
      api: {
        status(code: number) {
          out.code = code;
          return this;
        },
        setHeader(k: string, v: string) {
          out.headers[k] = v;
        },
        send(body: string) {
          out.body = body;
        },
      },
    };
  }

  it('responde HTML con la vista previa, tomando el origen del encabezado', async () => {
    vi.stubGlobal('fetch', fetchStub({ name: 'PUTI HALLOWEEN', starts_at: null, location: null }));
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const r = res();
    await handler(
      { query: { slug: 'cumpleanos-fran-j4h7' }, headers: { host: 'fcumple.example', 'x-forwarded-proto': 'https' } },
      r.api,
    );
    expect(r.out.code).toBe(200);
    expect(r.out.headers['content-type']).toMatch(/text\/html/);
    expect(r.out.body).toContain('<title>PUTI HALLOWEEN</title>');
    expect(r.out.body).toContain('https://fcumple.example/e/cumpleanos-fran-j4h7');
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('nunca lanza: ante cualquier fallo responde 200 con la vista previa neutra', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('todo se cayó');
      }),
    );
    const r = res();
    await expect(handler({ query: {}, headers: {} }, r.api)).resolves.toBeUndefined();
    expect(r.out.code).toBe(200);
    expect(r.out.body).toContain(NEUTRAL.title);
    vi.unstubAllGlobals();
  });
});
