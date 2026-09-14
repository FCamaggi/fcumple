import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrientation } from './useOrientation';

/**
 * Mismo mock de matchMedia que useIsMobile.test.ts: soporta el listener
 * moderno (`addEventListener`) y expone un helper para simular al usuario
 * girando el teléfono mientras la cámara está abierta.
 */
function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(e: { matches: boolean }) => void>();

  const mql = {
    get matches() {
      return matches;
    },
    media: '(orientation: portrait)',
    addEventListener: vi.fn((_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb)),
  };

  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));

  return {
    change(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useOrientation', () => {
  it('reports portrait when the viewport already matches the portrait query', () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => useOrientation());

    expect(result.current).toBe('portrait');
  });

  it('reports landscape when the viewport does not match portrait', () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useOrientation());

    expect(result.current).toBe('landscape');
  });

  it('updates when the device is rotated mid-session', () => {
    const media = mockMatchMedia(true);

    const { result } = renderHook(() => useOrientation());
    expect(result.current).toBe('portrait');

    act(() => media.change(false));

    expect(result.current).toBe('landscape');
  });
});
