import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { supabase } from './supabaseClient';
import { signIn, signOut, useSession } from './auth';

beforeEach(() => {
  vi.mocked(supabase.auth.signInWithPassword).mockReset();
  vi.mocked(supabase.auth.signOut).mockReset();
});

describe('signIn', () => {
  it('resolves when credentials are valid', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: {}, session: {} },
      error: null,
    } as never);

    await expect(signIn('admin@fcumple.com', 'correcta')).resolves.toBeUndefined();
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@fcumple.com',
      password: 'correcta',
    });
  });

  it('throws a readable error when credentials are invalid', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    } as never);

    await expect(signIn('admin@fcumple.com', 'incorrecta')).rejects.toThrow(
      /invalid login credentials|credenciales/i,
    );
  });
});

describe('signOut', () => {
  it('signs the user out', async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: null } as never);

    await signOut();

    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});

describe('useSession', () => {
  it('starts loading, then resolves the initial session and subscribes to changes', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    } as never);
    const unsubscribe = vi.fn();
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
      data: { subscription: { unsubscribe } },
    } as never);

    const { result, unmount } = renderHook(() => useSession());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual({ user: { id: 'u1' } });

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
