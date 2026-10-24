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

describe('useEventPhotos: estado compartido por la página', () => {
  it('al publicar desde la revisión parte del evento más reciente, no del que había al montar', async () => {
    vi.mocked(api.publishPhotoBatch).mockResolvedValue(1);
    const onEventChange = vi.fn();
    const { result, rerender } = renderHook(({ ev }) => useEventPhotos(ev, onEventChange), {
      initialProps: { ev: { ...event, name: 'Viejo' } as api.OrganizerEvent },
    });
    await waitFor(() => expect(result.current.photos).toHaveLength(3));

    // Guardó Ajustes: el evento cambia pero su id es el mismo.
    rerender({ ev: { ...event, name: 'Nuevo' } as api.OrganizerEvent });
    await act(async () => {
      await result.current.source.publish();
    });

    expect(onEventChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nuevo', photosRevealedAt: expect.any(String) }));
  });

  it('el aviso de una publicación no sobrevive a recargar la lista (cambio de pestaña, «Actualizar»)', async () => {
    vi.mocked(api.publishPhotoBatch).mockResolvedValue(2);
    const { result } = renderHook(() => useEventPhotos(event, vi.fn()));
    await waitFor(() => expect(result.current.photos).toHaveLength(3));
    await act(async () => {
      await result.current.handlePublish();
    });
    expect(result.current.notice).toBe('Publicaste 2 foto(s).');

    act(() => result.current.reload());

    expect(result.current.notice).toBeNull();
  });

  it('tras un fallo, recargar no deja a la vista las fotos viejas: vuelve a «cargando» hasta que llegan las nuevas', async () => {
    const { result } = renderHook(() => useEventPhotos(event, vi.fn()));
    await waitFor(() => expect(result.current.photos).toHaveLength(3));

    vi.mocked(api.listEventPhotos).mockRejectedValueOnce(new Error('sin red'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe('sin red'));

    let resolve: (v: Awaited<ReturnType<typeof api.listEventPhotos>>) => void = () => undefined;
    vi.mocked(api.listEventPhotos).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    act(() => result.current.reload());

    expect(result.current.photos).toBeNull();
    expect(result.current.error).toBeNull();
    await act(async () => resolve([photo('z', 'pending')]));
    expect(result.current.photos).toHaveLength(1);
  });
});

describe('useEventPhotos', () => {
  it('sin evento todavía no pide nada, y al llegar el evento carga sus fotos', async () => {
    const { result, rerender } = renderHook(({ ev }: { ev: api.OrganizerEvent | null }) => useEventPhotos(ev, vi.fn()), {
      initialProps: { ev: null as api.OrganizerEvent | null },
    });

    expect(api.listEventPhotos).not.toHaveBeenCalled();
    expect(result.current.photos).toBeNull();

    rerender({ ev: event });
    await waitFor(() => expect(result.current.photos).toHaveLength(3));
    expect(api.listEventPhotos).toHaveBeenCalledWith('ev-1');
  });

  it('al recargar conserva las fotos que ya tenía hasta que llegan las nuevas', async () => {
    const { result } = renderHook(() => useEventPhotos(event, vi.fn()));
    await waitFor(() => expect(result.current.photos).toHaveLength(3));

    vi.mocked(api.listEventPhotos).mockResolvedValueOnce([photo('a', 'pending')]);
    act(() => result.current.reload());

    expect(result.current.photos).toHaveLength(3);
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
  });

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

  it('si dos cargas se cruzan, gana la última aunque la respuesta de la primera llegue después', async () => {
    let resolveOld!: (p: ReturnType<typeof photo>[]) => void;
    vi.mocked(api.listEventPhotos)
      .mockReset()
      .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce([photo('nueva', 'pending')]);
    const { result, rerender } = renderHook(({ k }) => useEventPhotos(event, vi.fn(), k), { initialProps: { k: 0 } });

    rerender({ k: 1 });
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    await act(async () => resolveOld([photo('v1', 'pending'), photo('v2', 'pending')]));

    expect(result.current.photos?.map((p) => p.id)).toEqual(['nueva']);
  });

  it('un error de antes desaparece cuando la recarga siguiente sale bien', async () => {
    vi.mocked(api.listEventPhotos).mockRejectedValueOnce(new Error('sin red'));
    const { result, rerender } = renderHook(({ k }) => useEventPhotos(event, vi.fn(), k), { initialProps: { k: 0 } });
    await waitFor(() => expect(result.current.error).toBe('sin red'));

    rerender({ k: 1 });

    await waitFor(() => expect(result.current.photos).toHaveLength(3));
    expect(result.current.error).toBeNull();
  });

  it('al cambiar de evento no deja ver las fotos del anterior', async () => {
    let resolveSecond!: (p: ReturnType<typeof photo>[]) => void;
    const { result, rerender } = renderHook(({ ev }) => useEventPhotos(ev, vi.fn()), { initialProps: { ev: event } });
    await waitFor(() => expect(result.current.photos).toHaveLength(3));
    vi.mocked(api.listEventPhotos).mockReturnValueOnce(new Promise((r) => (resolveSecond = r)));

    rerender({ ev: { ...event, id: 'ev-2' } as api.OrganizerEvent });

    await waitFor(() => expect(api.listEventPhotos).toHaveBeenLastCalledWith('ev-2'));
    expect(result.current.photos).toBeNull();
    await act(async () => resolveSecond([photo('x', 'approved')]));
    expect(result.current.photos).toHaveLength(1);
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

  it('el error de publicar se va al recargar o al volver a publicar', async () => {
    vi.mocked(api.publishPhotoBatch).mockRejectedValueOnce(new Error('No pudimos publicar las fotos.')).mockResolvedValueOnce(1);
    const { result } = renderHook(() => useEventPhotos(event, vi.fn()));
    await waitFor(() => expect(result.current.photos).toHaveLength(3));
    await act(() => result.current.handlePublish());
    expect(result.current.publishError).not.toBeNull();

    act(() => result.current.reload());
    expect(result.current.publishError).toBeNull();

    await act(() => result.current.handlePublish());
    expect(result.current.publishError).toBeNull();
  });

  it('si publicar falla muestra el error y no marca el evento', async () => {
    vi.mocked(api.publishPhotoBatch).mockRejectedValueOnce(new Error('No pudimos publicar las fotos.'));
    const onEventChange = vi.fn();
    const { result } = renderHook(() => useEventPhotos(event, onEventChange));
    await waitFor(() => expect(result.current.photos).toHaveLength(3));

    await act(() => result.current.handlePublish());

    // Un fallo al publicar no es un fallo de lectura: aparte, para que nadie ofrezca «Reintentar» (que solo relee).
    expect(result.current.publishError).toBe('No pudimos publicar las fotos.');
    expect(result.current.error).toBeNull();
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
