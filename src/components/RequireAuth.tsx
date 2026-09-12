import type { ReactNode } from 'react';
import { useSession } from '../lib/auth';
import AdminLogin from './AdminLogin';

interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Guards /admin: no session -> AdminLogin, resolving -> simple loading
 * state, session present -> renders the panel.
 */
export default function RequireAuth({ children }: RequireAuthProps) {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">Verificando sesión...</span>
      </div>
    );
  }

  if (!session) {
    return <AdminLogin />;
  }

  return <>{children}</>;
}
