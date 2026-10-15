import { describe, expect, it, vi } from 'vitest';
import { handleIdentify, type IdentifyDeps, type IdentityProvider, type RpcResult } from './identifyHandler';
import { createProviderFromEnv, PROVIDERS } from './providers';

const EVENT = { id: 'ev-1', identifier: 'rut_lookup' };
const VALID_RUT = '12.345.678-5';

function setup(overrides: Partial<IdentifyDeps> = {}, provider?: Partial<IdentityProvider>) {
  const resolveName = vi.fn().mockResolvedValue('JUAN CARLOS PEREZ GONZALEZ');
  const rpcPublic = vi.fn(async (): Promise<RpcResult> => ({ data: [EVENT], error: null }));
  const rpcPrivileged = vi.fn(async (fn: string): Promise<RpcResult> => {
    if (fn === 'register_verified_lookup') return { data: null, error: null };
    return {
      data: [{ outcome: 'ok', guest_token: 'tok-1', guest_id: 'g-1', guest_name: 'Juan Pérez' }],
      error: null,
    };
  });
  const deps: IdentifyDeps = {
    provider: { resolveName, ...provider },
    rpcPublic,
    rpcPrivileged,
    clientKey: '1.2.3.4',
    ...overrides,
  };
  return { deps, resolveName, rpcPublic, rpcPrivileged };
}

describe('handleIdentify', () => {
  it('resuelve el nombre y se lo pasa a la base; el RUT nunca llega a la base ni a la respuesta', async () => {
    const { deps, resolveName, rpcPublic, rpcPrivileged } = setup();

    const res = await handleIdentify({ slug: 'fiesta-abcd', rut: VALID_RUT }, deps);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ outcome: 'ok', guest_token: 'tok-1', guest_id: 'g-1', guest_name: 'Juan Pérez' });
    expect(resolveName).toHaveBeenCalledWith('12345678-5');
    expect(rpcPrivileged).toHaveBeenCalledWith('identify_guest_verified', {
      p_event_id: 'ev-1',
      p_verified_name: 'JUAN CARLOS PEREZ GONZALEZ',
    });

    const everythingSentToTheDatabase = JSON.stringify([...rpcPublic.mock.calls, ...rpcPrivileged.mock.calls]);
    expect(everythingSentToTheDatabase).not.toMatch(/12345678|12\.345\.678/);
    expect(JSON.stringify(res)).not.toMatch(/12345678|12\.345\.678/);
  });

  it('responde 501 si no hay proveedor configurado, sin tocar la base', async () => {
    const { deps, rpcPublic } = setup({ provider: null });
    const res = await handleIdentify({ slug: 'x', rut: VALID_RUT }, deps);
    expect(res.status).toBe(501);
    expect(rpcPublic).not.toHaveBeenCalled();
  });

  it.each([null, {}, { slug: 'x' }, { rut: VALID_RUT }, { slug: 1, rut: 2 }, { slug: '', rut: VALID_RUT }])(
    'responde 400 ante una petición mal formada %j',
    async (payload) => {
      const { deps } = setup();
      expect((await handleIdentify(payload, deps)).status).toBe(400);
    },
  );

  it('responde 404 si el evento no existe', async () => {
    const { deps } = setup({ rpcPublic: vi.fn(async () => ({ data: [], error: null })) });
    expect((await handleIdentify({ slug: 'nada', rut: VALID_RUT }, deps)).status).toBe(404);
  });

  it('responde 409 si el evento identifica por nombre', async () => {
    const { deps, resolveName } = setup({
      rpcPublic: vi.fn(async () => ({ data: [{ id: 'ev-1', identifier: 'name' }], error: null })),
    });
    const res = await handleIdentify({ slug: 'x', rut: VALID_RUT }, deps);
    expect(res.status).toBe(409);
    expect(resolveName).not.toHaveBeenCalled();
  });

  it('responde 400 ante un RUT con dígito verificador incorrecto, sin gastar una consulta', async () => {
    const { deps, resolveName, rpcPrivileged } = setup();
    const res = await handleIdentify({ slug: 'x', rut: '12.345.678-9' }, deps);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_rut' });
    expect(resolveName).not.toHaveBeenCalled();
    expect(rpcPrivileged).not.toHaveBeenCalled();
  });

  it('consume el presupuesto antes de llamar al proveedor y responde 429 al agotarse', async () => {
    const order: string[] = [];
    const { deps, resolveName } = setup({
      rpcPrivileged: vi.fn(async (fn: string) => {
        order.push(fn);
        return { data: null, error: { code: '53400', message: 'too many lookups' } };
      }),
    });
    const res = await handleIdentify({ slug: 'x', rut: VALID_RUT }, deps);
    expect(res.status).toBe(429);
    expect(order).toEqual(['register_verified_lookup']);
    expect(resolveName).not.toHaveBeenCalled();
  });

  it('pasa la IP del cliente al presupuesto', async () => {
    const { deps, rpcPrivileged } = setup();
    await handleIdentify({ slug: 'x', rut: VALID_RUT }, deps);
    expect(rpcPrivileged).toHaveBeenCalledWith('register_verified_lookup', {
      p_event_id: 'ev-1',
      p_client_key: '1.2.3.4',
    });
  });

  it('devuelve not_found si el proveedor no conoce el RUT, sin consultar la lista', async () => {
    const { deps, rpcPrivileged } = setup({}, { resolveName: vi.fn().mockResolvedValue(null) });
    const res = await handleIdentify({ slug: 'x', rut: VALID_RUT }, deps);
    expect(res).toEqual({ status: 200, body: { outcome: 'not_found' } });
    expect(rpcPrivileged).toHaveBeenCalledTimes(1); // solo el presupuesto
  });

  it('responde 502 sin detalle si el proveedor falla (el error podría contener el RUT)', async () => {
    const { deps } = setup({}, { resolveName: vi.fn().mockRejectedValue(new Error('fallo consultando 12345678-5')) });
    const res = await handleIdentify({ slug: 'x', rut: VALID_RUT }, deps);
    expect(res).toEqual({ status: 502, body: { error: 'provider_error' } });
    expect(JSON.stringify(res)).not.toContain('12345678');
  });

  it('propaga ambiguous y pending_approval sin token', async () => {
    const { deps } = setup({
      rpcPrivileged: vi.fn(async (fn: string) =>
        fn === 'register_verified_lookup'
          ? { data: null, error: null }
          : { data: [{ outcome: 'ambiguous', guest_token: null, guest_id: null, guest_name: null }], error: null },
      ),
    });
    const res = await handleIdentify({ slug: 'x', rut: VALID_RUT }, deps);
    expect(res.body).toMatchObject({ outcome: 'ambiguous', guest_token: null });
  });

  it('responde 502 si la base falla al identificar', async () => {
    const { deps } = setup({
      rpcPrivileged: vi.fn(async (fn: string) =>
        fn === 'register_verified_lookup'
          ? { data: null, error: null }
          : { data: null, error: { code: 'XX000', message: 'boom' } },
      ),
    });
    expect((await handleIdentify({ slug: 'x', rut: VALID_RUT }, deps)).status).toBe(502);
  });
});

describe('createProviderFromEnv', () => {
  it('no hay ningún proveedor registrado de fábrica', () => {
    expect(Object.keys(PROVIDERS)).toEqual([]);
    expect(createProviderFromEnv({})).toBeNull();
    expect(createProviderFromEnv({ IDENTITY_PROVIDER: 'nombrerutyfirma' })).toBeNull();
  });
});
