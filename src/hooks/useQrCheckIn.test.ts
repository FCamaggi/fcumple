import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/adminApi', () => ({
  checkInGuest: vi.fn(),
}));

import { checkInGuest } from '../lib/adminApi';
import { useQrCheckIn } from './useQrCheckIn';
import type { Guest } from '../types';

const guest: Guest = {
  id: 'g1',
  token: 'mafe-8842',
  fullName: 'Maria Fernanda Contreras',
  status: 'confirmed',
  plusOnesAllowed: 2,
  plusOnesConfirmed: 1,
  guestNote: null,
  respondedAt: '2026-05-20T00:00:00Z',
  checkedInAt: null,
};

beforeEach(() => {
  vi.mocked(checkInGuest).mockReset();
});

describe('useQrCheckIn', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useQrCheckIn([guest]));
    expect(result.current.state).toEqual({ phase: 'idle' });
  });

  it('resolves a bare-token QR payload to a success state with no previous check-in', async () => {
    vi.mocked(checkInGuest).mockResolvedValueOnce({ ...guest, checkedInAt: '2026-05-20T23:00:00Z' });
    const { result } = renderHook(() => useQrCheckIn([guest]));

    act(() => result.current.handleDetected('mafe-8842'));
    expect(result.current.state.phase).toBe('checking');

    await waitFor(() => expect(result.current.state.phase).toBe('success'));
    expect(checkInGuest).toHaveBeenCalledWith('mafe-8842');
    expect(result.current.state).toEqual({
      phase: 'success',
      guest: { ...guest, checkedInAt: '2026-05-20T23:00:00Z' },
      previousCheckedInAt: null,
    });
  });

  it('resolves a full guest-link QR payload by extracting the token first', async () => {
    vi.mocked(checkInGuest).mockResolvedValueOnce(guest);
    const { result } = renderHook(() => useQrCheckIn([guest]));

    act(() => result.current.handleDetected('https://fcumple.example.com/i/mafe-8842'));

    await waitFor(() => expect(result.current.state.phase).toBe('success'));
    expect(checkInGuest).toHaveBeenCalledWith('mafe-8842');
  });

  it('reports a previous check-in time when the guest had already arrived', async () => {
    const alreadyArrived: Guest = { ...guest, checkedInAt: '2026-05-20T22:00:00Z' };
    vi.mocked(checkInGuest).mockResolvedValueOnce(alreadyArrived);
    const { result } = renderHook(() => useQrCheckIn([alreadyArrived]));

    act(() => result.current.handleDetected('mafe-8842'));

    await waitFor(() => expect(result.current.state.phase).toBe('success'));
    expect(result.current.state).toEqual({
      phase: 'success',
      guest: alreadyArrived,
      previousCheckedInAt: '2026-05-20T22:00:00Z',
    });
  });

  it('goes to an error state when check_in_guest rejects (e.g. unknown token)', async () => {
    vi.mocked(checkInGuest).mockRejectedValueOnce(new Error('No pudimos registrar el check-in: no existe'));
    const { result } = renderHook(() => useQrCheckIn([guest]));

    act(() => result.current.handleDetected('token-inexistente'));

    await waitFor(() => expect(result.current.state.phase).toBe('error'));
    expect(result.current.state).toEqual({
      phase: 'error',
      message: 'No pudimos registrar el check-in: no existe',
    });
  });

  it('debounces: ignores further detections while checking/showing a result until reset() is called', async () => {
    vi.mocked(checkInGuest).mockResolvedValueOnce(guest);
    const { result } = renderHook(() => useQrCheckIn([guest]));

    act(() => result.current.handleDetected('mafe-8842'));
    act(() => result.current.handleDetected('mafe-8842')); // same frame loop, still "checking"
    act(() => result.current.handleDetected('otro-token')); // even a different token is ignored

    await waitFor(() => expect(result.current.state.phase).toBe('success'));
    expect(checkInGuest).toHaveBeenCalledTimes(1);

    act(() => result.current.handleDetected('otro-token'));
    expect(result.current.state.phase).toBe('success'); // still ignored: no reset() yet

    act(() => result.current.reset());
    expect(result.current.state).toEqual({ phase: 'idle' });

    vi.mocked(checkInGuest).mockResolvedValueOnce(guest);
    act(() => result.current.handleDetected('mafe-8842'));
    expect(result.current.state.phase).toBe('checking');
    expect(checkInGuest).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(result.current.state.phase).toBe('success'));
  });
});
