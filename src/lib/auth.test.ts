import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { supabase } from './supabaseClient';
import { signIn, signOut, signUp, useSession } from './auth';

beforeEach(() => {
  vi.mocked(supabase.auth.signInWithPassword).mockReset();
  vi.mocked(supabase.auth.signOut).mockReset();
  vi.mocked(supabase.auth.signUp).mockReset();
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

describe('signUp', () => {
  it('crea la cuenta y avisa que no hace falta confirmar cuando ya hay sesión', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({ data: { user: {}, session: {} }, error: null } as never);
    await expect(signUp('ana@example.com', 'contraseña-larga')).resolves.toEqual({ needsConfirmation: false });
    expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'contraseña-larga' });
  });

  it('avisa que hay que confirmar el correo cuando no se crea sesión', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({ data: { user: {}, session: null }, error: null } as never);
    await expect(signUp('ana@example.com', 'contraseña-larga')).resolves.toEqual({ needsConfirmation: true });
  });

  it.each([
    ['User already registered', /Ya existe una cuenta/],
    ['Password should be at least 8 characters', /al menos 8 caracteres/],
    ['Email rate limit exceeded', /Demasiados intentos/],
    ['Unable to validate email address: invalid format', /correo esté bien escrito/],
    ['algo raro', /No pudimos crear tu cuenta/],
  ])('traduce el error %j', async (message, expected) => {
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({ data: { user: null, session: null }, error: { message } } as never);
    await expect(signUp('ana@example.com', 'x')).rejects.toThrow(expected);
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
