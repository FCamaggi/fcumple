import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile, MOBILE_BREAKPOINT } from './useIsMobile';

/**
 * matchMedia mock que soporta el listener moderno (`addEventListener`) y
 * expone un helper para simular el navegador cruzando el breakpoint.
 */
function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(e: { matches: boolean }) => void>();

  const mql = {
    get matches() {
      return matches;
    },
    media: `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
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

describe('useIsMobile', () => {
  it('reports true when the viewport already matches the mobile breakpoint', () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it('reports false on a desktop-sized viewport', () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('updates when the viewport crosses the breakpoint', () => {
    const media = mockMatchMedia(false);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => media.change(true));

    expect(result.current).toBe(true);
  });
});
