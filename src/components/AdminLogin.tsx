import { useState } from 'react';
import { signIn } from '../lib/auth';

/**
 * AdminLogin — puerta de acceso a /admin.
 * No está en el catálogo de componentes con nombre propio de docs/DESIGN.md;
 * reusa la paleta y tipografía del resto del sistema (ink-950, mono/display).
 */
export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 border border-smoke-700/40 bg-ink-900 p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">Acceso restringido</span>
          <h1 className="font-display text-2xl uppercase tracking-wide text-paper-100">Consola admin</h1>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="admin-email" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="admin-password" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
            Contraseña
          </label>
          <input
            id="admin-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="h-11 bg-acid-400 font-display text-sm uppercase tracking-wider text-ink-950 shadow-glow-acid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
