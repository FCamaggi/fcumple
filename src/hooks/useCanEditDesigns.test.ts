import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DESIGN_EDIT_QUERY, useCanEditDesigns } from './useCanEditDesigns';

type Listener = (e: { matches: boolean }) => void;

/** matchMedia falso: solo la consulta de edición puede coincidir, y se puede cambiar a mano. */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  let matches = initial;
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === DESIGN_EDIT_QUERY && matches;
    },
    media: query,
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
  }));
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('useCanEditDesigns', () => {
  it('pide puntero fino y al menos 1024 px de ancho', () => {
    expect(DESIGN_EDIT_QUERY).toBe('(pointer: fine) and (min-width: 1024px)');
  });

  it('es verdadero en un computador', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useCanEditDesigns());
    expect(result.current).toBe(true);
  });

  it('es falso en un teléfono o una pantalla táctil angosta', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useCanEditDesigns());
    expect(result.current).toBe(false);
  });

  it('sigue los cambios (girar el teléfono, redimensionar la ventana)', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useCanEditDesigns());
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('deja de escuchar al desmontar', () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useCanEditDesigns());
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
