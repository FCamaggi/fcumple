import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { supabase } from './supabaseClient';
import { changePassword, signIn, signOut, signUp, useSession } from './auth';

beforeEach(() => {
  vi.mocked(supabase.auth.signInWithPassword).mockReset();
  vi.mocked(supabase.auth.signOut).mockReset();
  vi.mocked(supabase.auth.signUp).mockReset();
  vi.mocked(supabase.auth.updateUser).mockReset();
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

describe('changePassword', () => {
  const ok = { data: { user: {}, session: {} }, error: null } as never;

  it('comprueba la contraseña actual y luego guarda la nueva', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce(ok);
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({ data: { user: {} }, error: null } as never);

    await expect(changePassword('fran@example.com', 'Fran-2026-Temp', 'una-clave-larga')).resolves.toBeUndefined();
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'fran@example.com',
      password: 'Fran-2026-Temp',
    });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'una-clave-larga' });
  });

  it('no cambia nada si la contraseña actual es incorrecta', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    } as never);

    await expect(changePassword('fran@example.com', 'mala', 'una-clave-larga')).rejects.toThrow(
      'La contraseña actual no es correcta.',
    );
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ['New password should be different from the old password.', /distinta de la actual/],
    ['Password should be at least 8 characters.', /al menos 8 caracteres/],
    ['email rate limit exceeded', /Demasiados intentos/],
    ['boom', /No pudimos cambiar/],
  ])('traduce el error de Supabase: %s', async (message, expected) => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce(ok);
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({ data: { user: null }, error: { message } } as never);
    await expect(changePassword('fran@example.com', 'actual-123', 'nueva-1234')).rejects.toThrow(expected);
  });
});
