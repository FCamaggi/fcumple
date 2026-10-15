import { useState } from 'react';
import {
  loginGuest,
  registerGuest,
  type AuthResult,
  type EventPublic,
  type GuestSession,
  type LoginOutcome,
  type RegisterOutcome,
} from '../lib/platformApi';

interface IdentifyFormProps {
  slug: string;
  event: EventPublic;
  onIdentified: (session: GuestSession) => void;
}

type Mode = 'register' | 'login';

const PIN_PATTERN = /^[0-9]{4,6}$/;

function registerMessage(outcome: RegisterOutcome, event: EventPublic): string | null {
  switch (outcome) {
    case 'name_taken':
      return 'Ya hay alguien inscrito con ese nombre. Si eres tú, toca "Ya me inscribí"; si no, agrega tu segundo apellido.';
    case 'not_found':
      return 'No te encontramos en la lista. Revisa cómo escribiste tu nombre o avísale a quien organiza.';
    case 'ambiguous':
      return 'Hay más de una persona con ese nombre. Escribe también tu segundo apellido o tu segundo nombre.';
    case 'pending_approval':
      return event.accessMode === 'list_requests'
        ? 'Tu solicitud quedó pendiente. Quien organiza el evento debe aprobarla: vuelve a entrar más tarde con tu nombre y tu PIN.'
        : 'Tu solicitud quedó pendiente.';
    default:
      return null;
  }
}

function loginMessage(outcome: LoginOutcome): string | null {
  switch (outcome) {
    case 'invalid':
      return 'Nombre o PIN incorrectos.';
    case 'ambiguous':
      return 'Hay más de una persona con ese nombre. Escribe también tu segundo apellido o tu segundo nombre.';
    case 'locked':
      return 'Demasiados PIN equivocados. Espera 10 minutos o pídele a quien organiza que restablezca tu acceso.';
    case 'needs_registration':
      return 'Todavía no te inscribes. Toca "Inscribirme" para elegir tu PIN.';
    case 'pending_approval':
      return 'Tu solicitud sigue pendiente. Quien organiza el evento debe aprobarla.';
    default:
      return null;
  }
}

/**
 * IdentifyForm — entrada del enlace único del evento. La persona se inscribe
 * con su nombre y apellido y un PIN que elige ella misma, o inicia sesión con
 * los mismos dos datos. Sin lista previa, correo ni teléfono. El PIN vive solo
 * en el estado del formulario: se envía y se descarta, nunca se guarda en el
 * dispositivo (lo único que queda es el token de sesión).
 */
export default function IdentifyForm({ slug, event, onIdentified }: IdentifyFormProps) {
  const [mode, setMode] = useState<Mode>('register');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinRepeat, setPinRepeat] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'register';

  function switchMode(next: Mode) {
    setMode(next);
    setMessage(null);
    setPin('');
    setPinRepeat('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (name.trim().split(/\s+/).filter((w) => w.length >= 2).length < 2) {
      setMessage('Escribe tu nombre y tu apellido.');
      return;
    }
    if (!PIN_PATTERN.test(pin)) {
      setMessage('El PIN debe tener entre 4 y 6 números.');
      return;
    }
    if (isRegister && pin !== pinRepeat) {
      setMessage('Los dos PIN no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      const result: AuthResult<RegisterOutcome | LoginOutcome> = isRegister
        ? await registerGuest(slug, name, pin)
        : await loginGuest(slug, name, pin);

      if (result.outcome === 'ok' && result.guestToken) {
        onIdentified({ token: result.guestToken, guestName: result.guestName ?? '' });
        return;
      }

      setPin('');
      setPinRepeat('');
      setMessage(
        isRegister
          ? registerMessage(result.outcome as RegisterOutcome, event)
          : loginMessage(result.outcome as LoginOutcome),
      );
    } catch (err) {
      // Error de red o límite de intentos: se conserva lo escrito para reintentar.
      setMessage(err instanceof Error ? err.message : 'No pudimos completar la operación.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none';
  const labelClass = 'font-mono text-[11px] uppercase tracking-wider text-paper-100/70';

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4 border border-smoke-700/40 bg-ink-900 p-6 shadow-2xl"
    >
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">{event.name}</span>
        <h1 className="font-display text-2xl uppercase tracking-wide text-paper-100">
          {isRegister ? 'Inscríbete' : 'Entra'}
        </h1>
      </div>

      <div className="flex gap-2" role="group" aria-label="Modo de entrada">
        {(['register', 'login'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => switchMode(m)}
            className={`h-9 flex-1 font-mono text-[11px] uppercase tracking-wider ${
              mode === m ? 'bg-acid-400 text-ink-950' : 'border border-smoke-700/60 text-paper-100'
            }`}
          >
            {m === 'register' ? 'Inscribirme' : 'Ya me inscribí'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="entry-name" className={labelClass}>
          Nombre y apellido
        </label>
        <input
          id="entry-name"
          required
          autoComplete="name"
          placeholder="Ana Rojas"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="entry-pin" className={labelClass}>
          {isRegister ? 'Elige un PIN (4 a 6 números)' : 'Tu PIN'}
        </label>
        <input
          id="entry-pin"
          required
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className={inputClass}
        />
      </div>

      {isRegister && (
        <div className="flex flex-col gap-1">
          <label htmlFor="entry-pin-repeat" className={labelClass}>
            Repite tu PIN
          </label>
          <input
            id="entry-pin-repeat"
            required
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="new-password"
            value={pinRepeat}
            onChange={(e) => setPinRepeat(e.target.value.replace(/\D/g, ''))}
            className={inputClass}
          />
          <p className="font-mono text-[10px] tracking-wide text-paper-100/50">
            Es solo para volver a entrar si cambias de celular. No lo compartas.
          </p>
        </div>
      )}

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
        {submitting ? 'Un momento...' : isRegister ? 'Inscribirme y entrar' : 'Entrar'}
      </button>
    </form>
  );
}
