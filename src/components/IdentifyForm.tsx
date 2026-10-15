import { useState } from 'react';
import { formatRutInput, isValidRut } from '../lib/rut';
import {
  identifyByName,
  identifyByRut,
  type EventPublic,
  type GuestSession,
  type IdentifyResult,
} from '../lib/platformApi';

interface IdentifyFormProps {
  slug: string;
  event: EventPublic;
  onIdentified: (session: GuestSession) => void;
}

/** Mensaje para los resultados que no dan acceso; `null` si se entró. */
function messageFor(result: IdentifyResult, event: EventPublic): string | null {
  switch (result.outcome) {
    case 'ambiguous':
      return 'Hay más de una persona con ese nombre. Escribe también tu segundo apellido o tu segundo nombre.';
    case 'pending_approval':
      return 'Tu solicitud quedó pendiente. Quien organiza el evento debe aprobarla: vuelve a intentarlo más tarde.';
    case 'not_found':
      return event.accessMode === 'list_requests'
        ? 'No te encontramos en la lista. Revisa cómo escribiste tu nombre.'
        : 'No te encontramos en la lista. Revisa cómo escribiste tu nombre o avísale a quien organiza.';
    default:
      return null;
  }
}

/**
 * IdentifyForm — "¿Quién eres?" del enlace único del evento. Pide nombre y
 * apellido, o el RUT cuando el evento verifica con un servicio externo. El RUT
 * vive solo en el estado de este formulario mientras se escribe: se envía y
 * se descarta, y nunca se persiste.
 */
export default function IdentifyForm({ slug, event, onIdentified }: IdentifyFormProps) {
  const byRut = event.identifier === 'rut_lookup';
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (byRut) {
      if (!isValidRut(value)) {
        setMessage('Revisa tu RUT: parece que hay un error de tipeo.');
        return;
      }
    } else if (value.trim().split(/\s+/).filter((w) => w.length >= 2).length < 2) {
      setMessage('Escribe tu nombre y tu apellido.');
      return;
    }

    setSubmitting(true);
    try {
      const result = byRut ? await identifyByRut(slug, value) : await identifyByName(slug, value);
      // Con respuesta del servidor (acierto o no) el RUT ya cumplió su función.
      if (byRut) setValue('');
      if (result.outcome === 'ok' && result.guestToken) {
        onIdentified({ token: result.guestToken, guestName: result.guestName ?? '' });
        return;
      }
      setMessage(messageFor(result, event));
    } catch (err) {
      // Error de red o límite de intentos: se conserva lo escrito para reintentar.
      setMessage(err instanceof Error ? err.message : 'No pudimos identificarte.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4 border border-smoke-700/40 bg-ink-900 p-6 shadow-2xl"
    >
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">{event.name}</span>
        <h1 className="font-display text-2xl uppercase tracking-wide text-paper-100">¿Quién eres?</h1>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="identify-value" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
          {byRut ? 'Tu RUT' : 'Nombre y apellido'}
        </label>
        <input
          id="identify-value"
          required
          autoComplete={byRut ? 'off' : 'name'}
          inputMode={byRut ? 'text' : undefined}
          placeholder={byRut ? '12.345.678-5' : 'Ana Rojas'}
          value={value}
          onChange={(e) => setValue(byRut ? formatRutInput(e.target.value) : e.target.value)}
          className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
        />
        {byRut && (
          <p className="font-mono text-[10px] tracking-wide text-paper-100/50">
            Usamos tu RUT solo para encontrarte en la lista. No lo guardamos.
          </p>
        )}
      </div>

      {message && (
        <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-11 bg-acid-400 font-display text-sm uppercase tracking-wider text-ink-950 shadow-glow-acid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Buscando...' : 'Entrar'}
      </button>
    </form>
  );
}
