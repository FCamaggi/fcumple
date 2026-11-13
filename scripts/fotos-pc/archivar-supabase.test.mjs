import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ConfigError, isNotFound, readConfig, supabaseDeps } from './archivar-supabase.mjs';

const ENV = { SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'clave', FOTOS_DIR: '/fotos' };

/** Cliente real de supabase-js con un fetch falso que registra cada petición y responde con `respond`. */
function clientWith(respond) {
  const requests = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    requests.push({ method: init.method ?? 'GET', url, body: init.body });
    return respond(url, init);
  };
  const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  return { supabase, requests };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('readConfig', () => {
  it('lee las variables y las opciones', () => {
    expect(readConfig(['--una-vez', '--conservar-en-storage'], { ...ENV, FOTOS_INTERVALO_S: '30', FOTOS_LOTE: '5' })).toEqual({
      once: true,
      keepInStorage: true,
      url: ENV.SUPABASE_URL,
      key: 'clave',
      dir: '/fotos',
      intervalS: 30,
      limit: 5,
    });
    expect(readConfig([], ENV)).toMatchObject({ once: false, keepInStorage: false, intervalS: 15, limit: 20 });
  });

  it('explica qué falta o qué está mal', () => {
    expect(() => readConfig([], { FOTOS_DIR: '/fotos' })).toThrow(new ConfigError('faltan variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'));
    expect(() => readConfig(['--borrar-todo'], ENV)).toThrow('opción desconocida: --borrar-todo');
    expect(() => readConfig([], { ...ENV, FOTOS_LOTE: '0' })).toThrow('FOTOS_LOTE debe ser un entero entre 1 y 200');
    expect(() => readConfig([], { ...ENV, FOTOS_INTERVALO_S: 'x' })).toThrow('FOTOS_INTERVALO_S debe ser un entero de 1 o más');
  });
});

describe('supabaseDeps', () => {
  it('pide las fotos sin archivar, más antiguas primero, con su evento e invitado, desde el cursor', async () => {
    const row = { id: 'a', storage_path: 'x', event_id: 'e', guest_id: 'g', created_at: '2026-11-28T23:00:00Z' };
    const { supabase, requests } = clientWith(() => json([row]));
    const deps = supabaseDeps(supabase, () => {});

    expect(await deps.listPending(20, null)).toEqual([row]);
    let params = requests[0].url.searchParams;
    expect(requests[0].url.pathname).toBe('/rest/v1/photos');
    expect(params.get('select')).toBe('id,storage_path,event_id,guest_id,created_at');
    expect(params.get('original_archived_at')).toBe('is.null');
    expect(params.get('order')).toBe('created_at.asc,id.asc');
    expect(params.get('limit')).toBe('20');
    expect(params.get('or')).toBeNull();

    await deps.listPending(20, { created_at: '2026-11-28T23:00:00Z', id: 'a' });
    params = requests[1].url.searchParams;
    expect(params.get('or')).toBe('(created_at.gt.2026-11-28T23:00:00Z,and(created_at.eq.2026-11-28T23:00:00Z,id.gt.a))');
  });

  it('marcar o borrar sin afectar nada lanza (por ejemplo, una clave sin permisos)', async () => {
    const empty = clientWith(() => json([]));
    const deps = supabaseDeps(empty.supabase, () => {});
    await expect(deps.markArchived('id-1')).rejects.toThrow(/no se marcó/);
    await expect(deps.remove('e/g/a.jpg')).rejects.toThrow(/no borró/);
  });

  it('una descarga que Storage responde como no encontrada devuelve null; otro error lanza', async () => {
    const notFound = clientWith(() => json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 400));
    expect(await supabaseDeps(notFound.supabase, () => {}).download('e/g/a.jpg')).toBeNull();
    expect(notFound.requests[0].url.pathname).toBe('/storage/v1/object/party-photos/e/g/a.jpg');

    const broken = clientWith(() => json({ statusCode: '500', error: 'internal', message: 'Se cayó' }, 500));
    await expect(supabaseDeps(broken.supabase, () => {}).download('e/g/a.jpg')).rejects.toThrow(/descarga/);
  });

  it('marca la foto solo si seguía sin archivar', async () => {
    const { supabase, requests } = clientWith(() => json([{ id: 'id-9' }]));
    await supabaseDeps(supabase, () => {}).markArchived('id-9');
    const { method, url, body } = requests[0];
    expect(method).toBe('PATCH');
    expect(url.searchParams.get('id')).toBe('eq.id-9');
    expect(url.searchParams.get('original_archived_at')).toBe('is.null');
    expect(Object.keys(JSON.parse(body))).toEqual(['original_archived_at']);
  });

  it('isNotFound reconoce las formas en que Storage dice que no existe', () => {
    expect(isNotFound({ statusCode: '404' })).toBe(true);
    expect(isNotFound({ status: 404 })).toBe(true);
    expect(isNotFound({ message: 'Object not found' })).toBe(true);
    expect(isNotFound({ status: 500, statusCode: '500', message: 'boom' })).toBe(false);
  });
});
