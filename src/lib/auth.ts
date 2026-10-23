import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message);
  }
}

export interface SignUpResult {
  /** true si Supabase exige confirmar el correo antes de iniciar sesión. */
  needsConfirmation: boolean;
}

function signUpError(message: string): Error {
  if (/already registered|already been registered/i.test(message)) {
    return new Error('Ya existe una cuenta con ese correo. Inicia sesión.');
  }
  if (/password/i.test(message)) {
    return new Error('La contraseña debe tener al menos 8 caracteres.');
  }
  if (/rate limit|too many/i.test(message)) {
    return new Error('Demasiados intentos. Espera unos minutos y vuelve a probar.');
  }
  if (/email/i.test(message)) {
    return new Error('Revisa que el correo esté bien escrito.');
  }
  return new Error('No pudimos crear tu cuenta. Intenta de nuevo en un momento.');
}

/** Registro de organizadores (Fase 1): correo y contraseña. */
export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    throw signUpError(error.message);
  }
  // Con confirmación de correo activada, Supabase crea la cuenta pero no la sesión.
  return { needsConfirmation: !data.session };
}

function changePasswordError(message: string): Error {
  // Primero lo más específico: "known to be weak ... please choose a different one" también dice "different".
  if (/weak|pwned|breach|known to be/i.test(message)) {
    return new Error('Esa contraseña es muy fácil de adivinar. Elige otra.');
  }
  if (/same.*password|different from the old|should be different/i.test(message)) {
    return new Error('La nueva contraseña debe ser distinta de la actual.');
  }
  if (/rate limit|too many/i.test(message)) {
    return new Error('Demasiados intentos. Espera unos minutos y vuelve a probar.');
  }
  if (/at least|characters|too short/i.test(message)) {
    return new Error('La contraseña debe tener al menos 8 caracteres.');
  }
  return new Error('No pudimos cambiar tu contraseña. Intenta de nuevo en un momento.');
}

/**
 * Cambia la contraseña de la cuenta con sesión abierta. Pide la actual y la
 * comprueba iniciando sesión de nuevo: la cuenta puede estar compartida con una
 * contraseña provisoria, y así quien la cambia demuestra que la conoce. Después
 * cierra las demás sesiones: quien sabía la provisoria no sigue dentro.
 */
export async function changePassword(email: string, currentPassword: string, newPassword: string): Promise<void> {
  const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (reauthError) {
    const text = `${reauthError.message ?? ''} ${(reauthError as { code?: string }).code ?? ''}`;
    if ((reauthError as { status?: number }).status === 400 || /invalid.*credentials|invalid_credentials/i.test(text)) {
      throw new Error('La contraseña actual no es correcta.');
    }
    if (/rate limit|too many/i.test(text)) {
      throw new Error('Demasiados intentos. Espera unos minutos y vuelve a probar.');
    }
    throw new Error('No pudimos comprobar tu contraseña. Intenta de nuevo en un momento.');
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw changePasswordError(error.message);
  }
  try {
    await supabase.auth.signOut({ scope: 'others' });
  } catch {
    // La contraseña ya cambió; cerrar las otras sesiones es un refuerzo, no un requisito.
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
