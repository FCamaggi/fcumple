import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/organizerApi', () => ({
  listEventPhotos: vi.fn(),
  moderateEventPhoto: vi.fn(),
  publishPhotoBatch: vi.fn(),
}));

import * as api from '../lib/organizerApi';
import { useEventPhotos } from './useEventPhotos';

const event = { id: 'ev-1', photosRevealedAt: null } as unknown as api.OrganizerEvent;

function photo(id: string, status: 'pending' | 'approved' | 'rejected', publishedAt: string | null = null) {
  return { id, status, publishedAt, guestFullName: 'Ana Rojas' } as unknown as Awaited<
    ReturnType<typeof api.listEventPhotos>
  >[number];
}

beforeEach(() => {
  vi.mocked(api.listEventPhotos)
    .mockReset()
    .mockResolvedValue([photo('a', 'pending'), photo('b', 'approved'), photo('c', 'rejected')]);
  vi.mocked(api.publishPhotoBatch).mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('useEventPhotos', () => {
  it('carga las fotos del evento y las cuenta', async () => {
    const { result } = renderHook(() => useEventPhotos(event, vi.fn()));

    expect(result.current.photos).toBeNull();
    await waitFor(() => expect(result.current.photos).toHaveLength(3));
    expect(api.listEventPhotos).toHaveBeenCalledWith('ev-1');
    expect(result.current.counts).toEqual({ pending: 1, approved: 1, rejected: 1, unpublished: 1 });
  });

  it('si no puede cargar deja el error y reintentar lo limpia y vuelve a pedir', async () => {
    vi.mocked(api.listEventPhotos).mockRejectedValueOnce(new Error('sin red'));
    const { result } = renderHook(() => useEventPhotos(event, vi.fn()));

    await waitFor(() => expect(result.current.error).toBe('sin red'));
    expect(result.current.photos).toBeNull();

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.photos).toHaveLength(3));
    expect(result.current.error).toBeNull();
  });

  it('vuelve a pedir las fotos cuando cambia la clave de refresco', async () => {
    const { result, rerender } = renderHook(({ k }) => useEventPhotos(event, vi.fn(), k), { initialProps: { k: 0 } });
    await waitFor(() => expect(result.current.photos).toHaveLength(3));

    rerender({ k: 1 });

    await waitFor(() => expect(api.listEventPhotos).toHaveBeenCalledTimes(2));
  });

  it('publicar pregunta antes, avisa cuántas sin revisar quedan y no publica si dices que no', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    const { result } = renderHook(() => useEventPhotos(event, vi.fn()));
    await waitFor(() => expect(result.current.photos).toHaveLength(3));

    await act(() => result.current.handlePublish());

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/1 foto\(s\) aprobada\(s\).*1 foto\(s\) sin revisar/s));
    expect(api.publishPhotoBatch).not.toHaveBeenCalled();
  });

  it('publicar el lote avisa cuántas fotos salieron, marca el evento «con fotos» y recarga', async () => {
    vi.mocked(api.publishPhotoBatch).mockResolvedValueOnce(1);
    const onEventChange = vi.fn();
    const { result } = renderHook(() => useEventPhotos(event, onEventChange));
    await waitFor(() => expect(result.current.photos).toHaveLength(3));

    await act(() => result.current.handlePublish());

    expect(api.publishPhotoBatch).toHaveBeenCalledWith('ev-1');
    expect(result.current.notice).toBe('Publicaste 1 foto(s).');
    expect(onEventChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'ev-1', photosRevealedAt: expect.any(String) }));
    await waitFor(() => expect(api.listEventPhotos).toHaveBeenCalledTimes(2));
  });

  it('si publicar falla muestra el error y no marca el evento', async () => {
    vi.mocked(api.publishPhotoBatch).mockRejectedValueOnce(new Error('No pudimos publicar las fotos.'));
    const onEventChange = vi.fn();
    const { result } = renderHook(() => useEventPhotos(event, onEventChange));
    await waitFor(() => expect(result.current.photos).toHaveLength(3));

    await act(() => result.current.handlePublish());

    expect(result.current.error).toBe('No pudimos publicar las fotos.');
    expect(result.current.publishing).toBe(false);
    expect(onEventChange).not.toHaveBeenCalled();
  });

  it('la fuente de moderación lista, modera y publica sobre este evento', async () => {
    vi.mocked(api.moderateEventPhoto).mockResolvedValueOnce(undefined);
    vi.mocked(api.publishPhotoBatch).mockResolvedValueOnce(2);
    const { result } = renderHook(() => useEventPhotos(event, vi.fn()));
    await waitFor(() => expect(result.current.photos).toHaveLength(3));

    await result.current.source.list();
    await result.current.source.moderate('p1', 'approved');
    const published = await result.current.source.publish();

    expect(api.moderateEventPhoto).toHaveBeenCalledWith('p1', 'approved');
    expect(published).toBe(2);
    expect(api.publishPhotoBatch).toHaveBeenCalledWith('ev-1');
  });
});
