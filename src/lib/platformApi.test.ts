import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from './supabaseClient';
import {
  clearGuestSession,
  getEventPublic,
  getMyGuest,
  identifyByName,
  identifyByRut,
  loadGuestSession,
  saveGuestSession,
} from './platformApi';

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const eventRow = {
  id: 'ev-1',
  name: 'Cumple de Fabrizio',
  starts_at: '2026-12-05T01:00:00Z',
  location: 'Casa',
  rsvp_deadline: null,
  access_mode: 'list',
  identifier: 'name',
  camera_unlock: 'on_identify',
  rsvp_enabled: false,
  photos_revealed: false,
};

beforeEach(() => {
  rpc.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getEventPublic', () => {
  it('mapea la fila a camelCase', async () => {
    rpc.mockResolvedValueOnce({ data: [eventRow], error: null });
    const event = await getEventPublic('fiesta-abcd');
    expect(rpc).toHaveBeenCalledWith('get_event_public', { p_slug: 'fiesta-abcd' });
    expect(event).toMatchObject({ id: 'ev-1', accessMode: 'list', identifier: 'name', cameraUnlock: 'on_identify' });
  });

  it('devuelve null si el slug no existe', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await getEventPublic('nada')).toBeNull();
  });

  it('lanza un mensaje legible si la RPC falla', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(getEventPublic('x')).rejects.toThrow(/No pudimos cargar el evento/);
  });
});

describe('identifyByName', () => {
  it('devuelve el resultado mapeado', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ outcome: 'ok', guest_token: 'tok', guest_id: 'g1', guest_name: 'Ana Rojas' }],
      error: null,
    });
    const result = await identifyByName('fiesta-abcd', 'Ana Rojas');
    expect(rpc).toHaveBeenCalledWith('identify_guest', { p_slug: 'fiesta-abcd', p_name: 'Ana Rojas' });
    expect(result).toEqual({ outcome: 'ok', guestToken: 'tok', guestId: 'g1', guestName: 'Ana Rojas' });
  });

  it.each([
    ['22023', /nombre y tu apellido/],
    ['53400', /Demasiados intentos/],
    ['P0002', /no existe/],
    ['42501', /RUT/],
    ['XX000', /No pudimos identificarte/],
  ])('traduce el código %s', async (code, message) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'x' } });
    await expect(identifyByName('s', 'Ana Rojas')).rejects.toThrow(message);
  });
});

describe('identifyByRut', () => {
  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('envía el RUT solo a /api/identify y mapea la respuesta', async () => {
    const fetchMock = stubFetch(200, { outcome: 'ok', guest_token: 'tok', guest_id: 'g1', guest_name: 'Juan Pérez' });
    const result = await identifyByRut('fiesta-abcd', '12.345.678-5');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/identify');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ slug: 'fiesta-abcd', rut: '12.345.678-5' });
    expect(result.outcome).toBe('ok');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [400, /RUT/],
    [404, /no existe/],
    [429, /Demasiados intentos/],
    [501, /todavía no está disponible/],
    [502, /No pudimos identificarte/],
  ])('traduce el estado HTTP %s', async (status, message) => {
    stubFetch(status, { error: 'x' });
    await expect(identifyByRut('s', '12.345.678-5')).rejects.toThrow(message);
  });

  it('avisa si no hay conexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await expect(identifyByRut('s', '12.345.678-5')).rejects.toThrow(/conexión/);
  });
});

describe('getMyGuest', () => {
  it('devuelve al invitado del token', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ id: 'g1', event_id: 'ev-1', full_name: 'Ana Rojas', checked_in_at: null, photo_quota: 5 }],
      error: null,
    });
    expect(await getMyGuest('tok')).toEqual({
      id: 'g1',
      eventId: 'ev-1',
      fullName: 'Ana Rojas',
      checkedInAt: null,
      photoQuota: 5,
    });
  });

  it('devuelve null con un token que no corresponde a nadie', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await getMyGuest('nope')).toBeNull();
  });
});

describe('sesión del invitado', () => {
  it('guarda, recupera y borra token y nombre por evento, sin ningún RUT', () => {
    saveGuestSession('fiesta-abcd', { token: 'tok', guestName: 'Ana Rojas' });
    expect(loadGuestSession('fiesta-abcd')).toEqual({ token: 'tok', guestName: 'Ana Rojas' });
    expect(loadGuestSession('otra-fiesta')).toBeNull();
    expect(Object.keys(window.localStorage)).toEqual(['fcumple:session:fiesta-abcd']);
    expect(window.localStorage.getItem('fcumple:session:fiesta-abcd')).not.toMatch(/rut/i);

    clearGuestSession('fiesta-abcd');
    expect(loadGuestSession('fiesta-abcd')).toBeNull();
  });

  it('ignora datos corruptos', () => {
    window.localStorage.setItem('fcumple:session:x', '{no es json');
    expect(loadGuestSession('x')).toBeNull();
    window.localStorage.setItem('fcumple:session:x', JSON.stringify({ token: 1 }));
    expect(loadGuestSession('x')).toBeNull();
  });

  it('no revienta si el almacenamiento falla', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => saveGuestSession('x', { token: 't', guestName: 'n' })).not.toThrow();
    expect(loadGuestSession('x')).toBeNull();
    vi.restoreAllMocks();
  });
});
