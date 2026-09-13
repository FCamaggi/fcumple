import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from './supabaseClient';
import { devCheckIn, devResetGuest } from './devApi';

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const row = {
  id: 'dev1',
  full_name: 'Invitado DEV',
  status: 'confirmed' as const,
  plus_ones_allowed: 10,
  plus_ones_confirmed: 2,
  guest_note: 'nota de prueba',
  responded_at: '2026-05-20T00:00:00Z',
  checked_in_at: '2026-05-20T23:00:00Z',
};

beforeEach(() => {
  rpc.mockReset();
});

describe('devCheckIn', () => {
  it('calls check_in_guest and maps the row to a Guest, keeping checkedInAt', async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null });

    const guest = await devCheckIn('dev-preview');

    expect(rpc).toHaveBeenCalledWith('check_in_guest', { p_token: 'dev-preview' });
    expect(guest).toEqual({
      id: 'dev1',
      fullName: 'Invitado DEV',
      status: 'confirmed',
      plusOnesAllowed: 10,
      plusOnesConfirmed: 2,
      guestNote: 'nota de prueba',
      respondedAt: '2026-05-20T00:00:00Z',
      checkedInAt: '2026-05-20T23:00:00Z',
    });
  });

  it('throws a readable error when supabase reports a failure', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });

    await expect(devCheckIn('dev-preview')).rejects.toThrow(/network down/);
  });
});

describe('devResetGuest', () => {
  it('calls dev_reset_guest and maps the row to a Guest', async () => {
    const resetRow = { ...row, status: 'pending' as const, plus_ones_confirmed: 0, checked_in_at: null };
    rpc.mockResolvedValueOnce({ data: [resetRow], error: null });

    const guest = await devResetGuest('dev-preview');

    expect(rpc).toHaveBeenCalledWith('dev_reset_guest', { p_token: 'dev-preview' });
    expect(guest.status).toBe('pending');
    expect(guest.plusOnesConfirmed).toBe(0);
    expect(guest.checkedInAt).toBeNull();
  });

  it('throws a readable error when supabase reports a failure', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    await expect(devResetGuest('dev-preview')).rejects.toThrow(/boom/);
  });
});
