import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollLock } from './useScrollLock';

afterEach(() => {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
});

describe('useScrollLock', () => {
  it('bloquea el scroll de la página mientras está montado y lo restaura al salir', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = renderHook(() => useScrollLock());
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.overscrollBehavior).toBe('none');

    unmount();
    expect(document.body.style.overflow).toBe('auto'); // vuelve a lo que tenía, no a vacío
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overscrollBehavior).toBe('');
  });

  it('con active=false no toca nada', () => {
    renderHook(() => useScrollLock(false));
    expect(document.body.style.overflow).toBe('');
  });

  it('con dos capas a la vez libera el scroll solo al cerrar la última', () => {
    const a = renderHook(() => useScrollLock());
    const b = renderHook(() => useScrollLock());
    a.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    b.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('se puede volver a bloquear después de liberar', () => {
    renderHook(() => useScrollLock()).unmount();
    const again = renderHook(() => useScrollLock());
    expect(document.body.style.overflow).toBe('hidden');
    again.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
