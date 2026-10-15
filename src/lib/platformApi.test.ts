import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from './supabaseClient';
import {
  clearGuestSession,
  getEventPublic,
  getMyGuest,
  loginGuest,
  registerGuest,
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
    expect(event).toMatchObject({ id: 'ev-1', accessMode: 'list', cameraUnlock: 'on_identify' });
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

describe('registerGuest', () => {
  it('llama a register_guest y mapea el resultado', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ outcome: 'ok', guest_token: 'tok', guest_id: 'g1', guest_name: 'Ana Rojas' }],
      error: null,
    });
    const result = await registerGuest('fiesta-abcd', 'Ana Rojas', '4821');
    expect(rpc).toHaveBeenCalledWith('register_guest', { p_slug: 'fiesta-abcd', p_name: 'Ana Rojas', p_pin: '4821' });
    expect(result).toEqual({ outcome: 'ok', guestToken: 'tok', guestId: 'g1', guestName: 'Ana Rojas' });
  });

  it.each([
    ['name_taken'],
    ['not_found'],
    ['ambiguous'],
    ['pending_approval'],
  ])('devuelve %s sin token', async (outcome) => {
    rpc.mockResolvedValueOnce({ data: [{ outcome, guest_token: null, guest_id: null, guest_name: null }], error: null });
    const result = await registerGuest('s', 'Ana Rojas', '4821');
    expect(result.outcome).toBe(outcome);
    expect(result.guestToken).toBeNull();
  });

  it.each([
    ['22023', 'first name and last name', /nombre y tu apellido/],
    ['22023', 'pin must be 4 to 6 digits', /PIN debe tener entre 4 y 6/],
    ['53400', 'too many attempts, try again later', /Demasiados intentos/],
    ['53400', 'event guest limit reached', /máximo de invitados/],
    ['P0002', 'event not found', /no existe/],
    ['XX000', 'boom', /No pudimos completar/],
  ])('traduce el error %s (%s)', async (code, message, expected) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code, message } });
    await expect(registerGuest('s', 'Ana Rojas', '4821')).rejects.toThrow(expected);
  });

  it('falla si la RPC no devuelve filas', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(registerGuest('s', 'Ana Rojas', '4821')).rejects.toThrow(/No pudimos completar/);
  });
});

describe('loginGuest', () => {
  it('llama a login_guest con nombre y PIN', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ outcome: 'ok', guest_token: 'tok', guest_id: 'g1', guest_name: 'Ana Rojas' }],
      error: null,
    });
    const result = await loginGuest('fiesta-abcd', 'Ana Rojas', '4821');
    expect(rpc).toHaveBeenCalledWith('login_guest', { p_slug: 'fiesta-abcd', p_name: 'Ana Rojas', p_pin: '4821' });
    expect(result.guestToken).toBe('tok');
  });

  it.each(['invalid', 'ambiguous', 'locked', 'needs_registration', 'pending_approval'])(
    'devuelve %s sin token',
    async (outcome) => {
      rpc.mockResolvedValueOnce({ data: [{ outcome, guest_token: null, guest_id: null, guest_name: null }], error: null });
      expect((await loginGuest('s', 'Ana Rojas', '4821')).outcome).toBe(outcome);
    },
  );

  it('traduce el límite de intentos', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '53400', message: 'too many attempts' } });
    await expect(loginGuest('s', 'Ana Rojas', '4821')).rejects.toThrow(/Demasiados intentos/);
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
  it('guarda, recupera y borra solo token y nombre por evento (nunca el PIN)', () => {
    saveGuestSession('fiesta-abcd', { token: 'tok', guestName: 'Ana Rojas' });
    expect(loadGuestSession('fiesta-abcd')).toEqual({ token: 'tok', guestName: 'Ana Rojas' });
    expect(loadGuestSession('otra-fiesta')).toBeNull();
    expect(Object.keys(window.localStorage)).toEqual(['fcumple:session:fiesta-abcd']);
    expect(window.localStorage.getItem('fcumple:session:fiesta-abcd')).not.toMatch(/pin|rut/i);

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
