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
