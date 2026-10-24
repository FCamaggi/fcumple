import type { ReactNode } from 'react';
import { useSession } from '../lib/auth';
import AdminLogin from './AdminLogin';

interface RequireAuthProps {
  children: ReactNode;
  /** Pantalla a mostrar sin sesión. Por defecto, el login del admin de la Fase 0. */
  login?: ReactNode;
}

/**
 * Guards /admin: no session -> AdminLogin, resolving -> simple loading
 * state, session present -> renders the panel.
 */
export default function RequireAuth({ children, login }: RequireAuthProps) {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-app items-center justify-center bg-ink-950">
        <span className="font-mono text-xs uppercase tracking-widest text-laser-500">Verificando sesión...</span>
      </div>
    );
  }

  if (!session) {
    return <>{login ?? <AdminLogin />}</>;
  }

  return <>{children}</>;
}
