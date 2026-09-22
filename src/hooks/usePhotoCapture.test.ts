import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../lib/photosApi', () => ({
  uploadPhoto: vi.fn(),
}));

import { uploadPhoto } from '../lib/photosApi';
import { usePhotoCapture } from './usePhotoCapture';

const uploadPhotoMock = uploadPhoto as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  uploadPhotoMock.mockReset();
});

const blob = new Blob(['x'], { type: 'image/jpeg' });
const displayBlob = new Blob(['x-display'], { type: 'image/jpeg' });

describe('usePhotoCapture', () => {
  it('goes idle -> uploading -> success and bumps `used` in the quota on a successful upload', async () => {
    uploadPhotoMock.mockResolvedValue({
      id: 'p1',
      guestId: 'g1',
      storagePath: 'tok/a.jpg',
      displayStoragePath: 'tok/a-display.jpg',
      status: 'pending',
      createdAt: '2026-06-01T00:00:00Z',
    });
    const onQuotaChange = vi.fn();
    const { result } = renderHook(() => usePhotoCapture('tok123', { quota: 5, used: 2 }, onQuotaChange));

    expect(result.current.state).toEqual({ phase: 'idle' });

    act(() => {
      result.current.capture(blob, displayBlob);
    });
    expect(result.current.state).toEqual({ phase: 'uploading' });

    await waitFor(() => expect(result.current.state).toEqual({ phase: 'success', status: 'pending' }));
    expect(uploadPhotoMock).toHaveBeenCalledWith('tok123', blob, displayBlob);
    expect(onQuotaChange).toHaveBeenCalledWith({ quota: 5, used: 3 });
  });

  it('passes through a null/undefined display blob unchanged (e.g. its generation failed client-side)', async () => {
    uploadPhotoMock.mockResolvedValue({
      id: 'p1',
      guestId: 'g1',
      storagePath: 'tok/a.jpg',
      displayStoragePath: null,
      status: 'pending',
      createdAt: '2026-06-01T00:00:00Z',
    });
    const { result } = renderHook(() => usePhotoCapture('tok123', { quota: 5, used: 2 }));

    act(() => {
      result.current.capture(blob, null);
    });

    await waitFor(() => expect(result.current.state).toEqual({ phase: 'success', status: 'pending' }));
    expect(uploadPhotoMock).toHaveBeenCalledWith('tok123', blob, null);
  });

  it('carries an "approved" status through when the guest has auto_approve_photos on', async () => {
    uploadPhotoMock.mockResolvedValue({
      id: 'p1',
      guestId: 'g1',
      storagePath: 'tok/a.jpg',
      displayStoragePath: 'tok/a-display.jpg',
      status: 'approved',
      createdAt: '2026-06-01T00:00:00Z',
    });
    const { result } = renderHook(() => usePhotoCapture('tok123', { quota: 5, used: 2 }));

    act(() => {
      result.current.capture(blob, displayBlob);
    });

    await waitFor(() => expect(result.current.state).toEqual({ phase: 'success', status: 'approved' }));
  });

  it('goes to an error state with a readable message when the upload fails', async () => {
    uploadPhotoMock.mockRejectedValue(new Error('La foto se subió pero no pudimos registrarla.'));
    const { result } = renderHook(() => usePhotoCapture('tok123', { quota: 5, used: 2 }));

    act(() => {
      result.current.capture(blob);
    });

    await waitFor(() =>
      expect(result.current.state).toEqual({
        phase: 'error',
        message: 'La foto se subió pero no pudimos registrarla.',
      }),
    );
  });

  it('reset() returns to idle', async () => {
    uploadPhotoMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => usePhotoCapture('tok123', { quota: 5, used: 2 }));

    act(() => {
      result.current.capture(blob);
    });
    await waitFor(() => expect(result.current.state.phase).toBe('error'));

    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toEqual({ phase: 'idle' });
  });
});
