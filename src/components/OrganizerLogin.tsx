import { useState } from 'react';
import { signIn, signUp } from '../lib/auth';

type Mode = 'signin' | 'signup';

const MIN_PASSWORD = 8;

/**
 * OrganizerLogin — acceso al panel del organizador (Fase 1): iniciar sesión o
 * crear una cuenta con correo y contraseña. Es lo único donde se pide correo;
 * los invitados nunca lo dan. Con confirmación de correo activada, al crear la
 * cuenta se pide revisar el correo; si no, la sesión se abre sola.
 */
export default function OrganizerLogin() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setRepeat('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (isSignup) {
      if (password.length < MIN_PASSWORD) {
        setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
        return;
      }
      if (password !== repeat) {
        setError('Las dos contraseñas no coinciden.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation) {
          setNotice('Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.');
          setMode('signin');
          setPassword('');
          setRepeat('');
        }
        // Sin confirmación, la sesión se abre sola y RequireAuth muestra el panel.
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos continuar.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none';
  const labelClass = 'font-mono text-[11px] uppercase tracking-wider text-paper-100/70';

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 border border-smoke-700/40 bg-ink-900 p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">Organizadores</span>
          <h1 className="font-display text-2xl uppercase tracking-wide text-paper-100">
            {isSignup ? 'Crea tu cuenta' : 'Tus eventos'}
          </h1>
        </div>

        <div className="flex gap-2" role="group" aria-label="Modo de acceso">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => switchMode(m)}
              className={`h-9 flex-1 font-mono text-[11px] uppercase tracking-wider ${
                mode === m ? 'bg-acid-400 text-ink-950' : 'border border-smoke-700/60 text-paper-100'
              }`}
            >
              {m === 'signin' ? 'Ya tengo cuenta' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="org-email" className={labelClass}>
            Correo
          </label>
          <input
            id="org-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="org-password" className={labelClass}>
            Contraseña
          </label>
          <input
            id="org-password"
            type="password"
            required
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {isSignup && (
          <div className="flex flex-col gap-1">
            <label htmlFor="org-password-repeat" className={labelClass}>
              Repite la contraseña
            </label>
            <input
              id="org-password-repeat"
              type="password"
              required
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        {notice && (
          <p role="status" className="font-mono text-[11px] uppercase tracking-wide text-acid-400">
            {notice}
          </p>
        )}
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
          {submitting ? 'Un momento...' : isSignup ? 'Crear mi cuenta' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
