import { useState } from 'react';
import { Link } from 'react-router-dom';
import { changePassword, useSession } from '../lib/auth';

const MIN_PASSWORD = 8;

const shell = 'min-h-screen bg-ink-950 px-4 py-8 text-paper-100';
const fieldClass =
  'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none focus-visible:ring-2 focus-visible:ring-acid-400';
const labelClass = 'font-mono text-[11px] uppercase tracking-wider text-paper-100/70';

/**
 * `/panel/cuenta` — la cuenta del organizador: cambiar la contraseña. Sirve
 * sobre todo cuando la cuenta se entregó con una contraseña provisoria.
 */
export default function OrganizerAccountPage() {
  const { session } = useSession();
  const email = session?.user.email ?? '';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!current) {
      setMessage({ kind: 'error', text: 'Escribe tu contraseña actual.' });
      return;
    }
    if (next.length < MIN_PASSWORD) {
      setMessage({ kind: 'error', text: `La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres.` });
      return;
    }
    if (next !== repeat) {
      setMessage({ kind: 'error', text: 'Las dos contraseñas nuevas no coinciden.' });
      return;
    }

    setSaving(true);
    try {
      await changePassword(email, current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      setMessage({ kind: 'ok', text: 'Cambiaste tu contraseña.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No pudimos cambiar tu contraseña.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={shell}>
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Link to="/panel" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/60 underline">
            ← Tus eventos
          </Link>
          <h1 className="font-display text-3xl uppercase tracking-wide">Tu cuenta</h1>
          {email && <p className="font-sans text-sm text-paper-100/80">{email}</p>}
        </header>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" aria-label="Cambiar contraseña">
          <div className="flex flex-col gap-1">
            <label htmlFor="acc-current" className={labelClass}>
              Contraseña actual
            </label>
            <input
              id="acc-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="acc-new" className={labelClass}>
              Contraseña nueva
            </label>
            <input
              id="acc-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={fieldClass}
            />
            <p className="font-sans text-xs text-paper-100/60">Al menos {MIN_PASSWORD} caracteres.</p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="acc-repeat" className={labelClass}>
              Repite la contraseña nueva
            </label>
            <input
              id="acc-repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className={fieldClass}
            />
          </div>

          {message && (
            <p
              role={message.kind === 'error' ? 'alert' : 'status'}
              className={`font-mono text-[11px] uppercase tracking-wide ${
                message.kind === 'error' ? 'text-flame-500' : 'text-acid-400'
              }`}
            >
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="h-11 bg-acid-400 font-display text-sm uppercase tracking-wider text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-100 disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
