import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from './supabaseClient';
import { getGuestByToken, submitRsvp } from './guestApi';

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const row = {
  id: 'g1',
  full_name: 'Maria Fernanda Contreras',
  status: 'pending' as const,
  plus_ones_allowed: 3,
  plus_ones_confirmed: 0,
  guest_note: null,
  responded_at: null,
};

beforeEach(() => {
  rpc.mockReset();
});

describe('getGuestByToken', () => {
  it('returns the guest mapped to camelCase for a valid token', async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null });

    const guest = await getGuestByToken('mafe-8842');

    expect(rpc).toHaveBeenCalledWith('get_guest_by_token', { p_token: 'mafe-8842' });
    expect(guest).toEqual({
      id: 'g1',
      token: 'mafe-8842',
      fullName: 'Maria Fernanda Contreras',
      status: 'pending',
      plusOnesAllowed: 3,
      plusOnesConfirmed: 0,
      checkedInAt: null,
      guestNote: null,
      respondedAt: null,
    });
  });

  it('returns null when no row matches the token', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });

    const guest = await getGuestByToken('no-existe');

    expect(guest).toBeNull();
  });

  it('throws a readable error when supabase reports a failure', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'network down', code: '500' } });

    await expect(getGuestByToken('mafe-8842')).rejects.toThrow(/network down/);
  });
});

describe('submitRsvp', () => {
  it('returns the updated guest on success', async () => {
    const updatedRow = { ...row, status: 'confirmed', plus_ones_confirmed: 2, responded_at: '2026-05-20T00:00:00Z' };
    rpc.mockResolvedValueOnce({ data: [updatedRow], error: null });

    const guest = await submitRsvp('mafe-8842', 'confirmed', 2, 'nota');

    expect(rpc).toHaveBeenCalledWith('submit_rsvp', {
      p_token: 'mafe-8842',
      p_status: 'confirmed',
      p_plus_ones: 2,
      p_note: 'nota',
    });
    expect(guest.status).toBe('confirmed');
    expect(guest.plusOnesConfirmed).toBe(2);
  });

  it('translates an invalid-parameter Postgres error into a domain message', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'plus_ones (5) must be between 0 and 2', code: '22023' },
    });

    await expect(submitRsvp('mafe-8842', 'confirmed', 5)).rejects.toThrow(
      /acompañantes|plus_ones|inválid/i,
    );
  });

  it('translates a missing-token Postgres error into a domain message', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'no guest matches this token', code: 'P0002' },
    });

    await expect(submitRsvp('no-existe', 'confirmed', 0)).rejects.toThrow(/enlace|token|invit/i);
  });

  it('falls back to a generic message for unexpected errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom', code: 'XXYYY' } });

    await expect(submitRsvp('mafe-8842', 'confirmed', 0)).rejects.toThrow(/no pudimos|error/i);
  });
});
