import { useEffect, useState } from 'react';
import {
  EnrollmentAnswersError,
  loginGuest,
  registerGuest,
  type AuthResult,
  type EventPublic,
  type GuestSession,
  type LoginOutcome,
  type RegisterOutcome,
} from '../lib/platformApi';
import {
  ENROLLMENT_LIMITS,
  cleanEnrollmentAnswers,
  enrollmentErrorMessage,
  serializeEnrollmentConfig,
} from '../lib/enrollmentConfig';

interface IdentifyFormProps {
  slug: string;
  event: EventPublic;
  onIdentified: (session: GuestSession) => void;
}

type Mode = 'register' | 'login';
type Errors = Record<string, string>;

const PIN_PATTERN = /^[0-9]{4,6}$/;

/** Orden en que se enfoca el primer campo con error. */
const FIELD_ORDER = ['name', 'pin', 'pin-repeat', 'plus', 'comment', 'q1', 'q2', 'q3'];

const EASE_OUT = 'ease-[cubic-bezier(0.23,1,0.32,1)]';

function registerMessage(outcome: RegisterOutcome): string | null {
  switch (outcome) {
    case 'name_taken':
      return 'Ya hay alguien inscrito con ese nombre. Si eres tú, toca "Ya me inscribí"; si no, agrega tu segundo apellido.';
    case 'not_found':
      return 'No te encontramos en la lista. Revisa cómo escribiste tu nombre o avísale a quien organiza.';
    case 'ambiguous':
      return 'Hay más de una persona con ese nombre. Escribe también tu segundo apellido o tu segundo nombre.';
    default:
      return null;
  }
}

function pendingMessage(event: EventPublic): string {
  return event.accessMode === 'list_requests'
    ? 'Tu solicitud quedó pendiente. Quien organiza el evento debe aprobarla: vuelve a entrar más tarde con tu nombre y tu PIN.'
    : 'Tu solicitud quedó pendiente.';
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
    default:
      return null;
  }
}

/** "viernes 30 de octubre" y "20:30" en la hora local del dispositivo. */
function formatWhen(iso: string | null): { day: string; time: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date),
    time: new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date),
  };
}

/** Traduce el código de una respuesta rechazada al campo que hay que corregir. */
function fieldForCode(code: string): string {
  const [kind, field] = code.split(':');
  if (kind.startsWith('plus_one')) return 'plus';
  if (kind.startsWith('comment')) return 'comment';
  if (kind.startsWith('question') && field) return field;
  return 'comment';
}

const inputClass =
  'w-full bg-ink-950 px-3 py-2.5 font-sans text-sm text-paper-100 outline-none placeholder:text-paper-100/50 ' +
  'focus-visible:ring-2 focus-visible:ring-acid-400 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-flame-500';
const labelClass = 'font-mono text-[11px] uppercase tracking-wider text-paper-100/70';

/** Campo con etiqueta, ayuda y error asociados (aria-describedby). */
function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: (a11y: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => React.ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={labelClass}>
        {label}
        {optional && <span className="ml-2 text-paper-100/50">opcional</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && (
        <p id={`${id}-hint`} className="font-mono text-[10px] tracking-wide text-paper-100/50">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}
    </div>
  );
}

/** Aparece con un fundido corto (animación CSS: si no corre, el contenido ya es visible). */
function Reveal({ children }: { children: React.ReactNode }) {
  return <div className="animate-reveal">{children}</div>;
}

/**
 * IdentifyForm — entrada del enlace único del evento. La persona se inscribe
 * con su nombre y apellido y un PIN que elige ella misma, o inicia sesión con
 * los mismos dos datos. Sin lista previa, correo ni teléfono. El PIN vive solo
 * en el estado del formulario: se envía y se descarta, nunca se guarda en el
 * dispositivo (lo único que queda es el token de sesión).
 *
 * Al inscribirse, además, se piden las respuestas que el organizador configuró
 * (acompañantes, comentario, preguntas propias): ver `enrollmentConfig.ts`.
 */
export default function IdentifyForm({ slug, event, onIdentified }: IdentifyFormProps) {
  const { enrollment } = event;
  const [mode, setMode] = useState<Mode>('register');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinRepeat, setPinRepeat] = useState('');
  const [plusCount, setPlusCount] = useState(0);
  const [plusNames, setPlusNames] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [focusField, setFocusField] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'register';
  const when = formatWhen(event.startsAt);

  // Enfoca el primer campo con error una vez que el formulario ya lo pintó.
  useEffect(() => {
    if (!focusField) return;
    const target = document.getElementById(focusField);
    if (target instanceof HTMLElement) target.focus();
    setFocusField(null);
  }, [focusField]);

  function fail(next: Errors) {
    setErrors(next);
    const first = FIELD_ORDER.find((f) => f in next);
    if (!first) return;
    setFocusField(first === 'plus' ? `entry-plus-${plusNames.findIndex((n) => !n.trim())}` : `entry-${first}`);
  }

  /** ¿Existe en pantalla el campo al que apunta un error? (el organizador pudo cambiar el formulario). */
  function isRendered(field: string): boolean {
    if (field === 'comment') return Boolean(enrollment.comment);
    if (field === 'plus') return Boolean(enrollment.plusOnes) && plusNames.some((n) => !n.trim());
    if (/^q[1-3]$/.test(field)) return enrollment.questions.some((q) => q.id === field);
    return true;
  }

  /** Al corregir un campo, su error deja de ser cierto: se quita. */
  function clearError(field: string) {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const { [field]: _gone, ...rest } = prev;
      return rest;
    });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
    setMessage(null);
    setNotice(null);
    setPin('');
    setPinRepeat('');
  }

  function choosePlusCount(count: number) {
    setPlusCount(count);
    setPlusNames((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? ''));
    setErrors((prev) => {
      const { plus: _plus, ...rest } = prev;
      return rest;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setNotice(null);

    const next: Errors = {};
    if (name.trim().split(/\s+/).filter((w) => w.length >= 2).length < 2) {
      next.name = 'Escribe tu nombre y tu apellido.';
    }
    if (!PIN_PATTERN.test(pin)) {
      next.pin = 'El PIN debe tener entre 4 y 6 números.';
    } else if (isRegister && pin !== pinRepeat) {
      next['pin-repeat'] = 'Los dos PIN no coinciden.';
    }

    let cleanAnswers: Record<string, unknown> | undefined;
    if (isRegister) {
      const raw: Record<string, unknown> = {
        plus_ones: plusNames.slice(0, plusCount),
        comment,
        ...answers,
      };
      const cleaned = cleanEnrollmentAnswers(serializeEnrollmentConfig(enrollment), raw);
      if (cleaned.ok) {
        cleanAnswers = cleaned.answers;
      } else {
        next[fieldForCode(cleaned.error)] = enrollmentErrorMessage(cleaned.error, enrollment);
      }
    }

    if (Object.keys(next).length > 0) {
      fail(next);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const result: AuthResult<RegisterOutcome | LoginOutcome> = isRegister
        ? await registerGuest(slug, name, pin, cleanAnswers)
        : await loginGuest(slug, name, pin);

      if (result.outcome === 'ok' && result.guestToken) {
        onIdentified({ token: result.guestToken, guestName: result.guestName ?? '' });
        return;
      }

      setPin('');
      setPinRepeat('');
      if (result.outcome === 'pending_approval') {
        setNotice(isRegister ? pendingMessage(event) : 'Tu solicitud sigue pendiente. Quien organiza el evento debe aprobarla.');
      } else {
        setMessage(
          isRegister
            ? registerMessage(result.outcome as RegisterOutcome)
            : loginMessage(result.outcome as LoginOutcome),
        );
      }
    } catch (err) {
      // Error de red o límite de intentos: se conserva lo escrito para reintentar.
      if (err instanceof EnrollmentAnswersError) {
        const field = fieldForCode(err.code);
        const text = enrollmentErrorMessage(err.code, enrollment);
        if (isRendered(field)) {
          fail({ [field]: text });
        } else {
          // El campo que falla ya no está en pantalla: lo más probable es que el organizador cambió el formulario.
          setMessage(`${text} Es posible que el organizador haya cambiado el formulario: recarga la página e intenta de nuevo.`);
        }
      } else {
        setMessage(err instanceof Error ? err.message : 'No pudimos completar la operación.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex w-full max-w-sm flex-col gap-5 border border-smoke-700/40 bg-ink-900 p-6 shadow-2xl"
    >
      <header className="flex flex-col gap-3 border-b border-dashed border-smoke-700/60 pb-5">
        <h1 className="font-display text-3xl uppercase leading-tight tracking-wide text-paper-100">{event.name}</h1>
        {(when || event.location) && (
          <p className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-wider text-laser-500">
            {when && (
              <span>
                {when.day} · {when.time}
              </span>
            )}
            {event.location && <span>{event.location}</span>}
          </p>
        )}
        {isRegister && enrollment.welcome && (
          <p className="whitespace-pre-line font-sans text-sm text-paper-100/80">{enrollment.welcome}</p>
        )}
      </header>

      <div className="flex gap-2" role="group" aria-label="Modo de entrada">
        {(['register', 'login'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => switchMode(m)}
            className={`h-11 flex-1 font-mono text-[11px] uppercase tracking-wider transition-transform duration-150 ${EASE_OUT} active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-400 ${
              mode === m ? 'bg-acid-400 text-ink-950' : 'border border-smoke-700/60 text-paper-100'
            }`}
          >
            {m === 'register' ? 'Inscribirme' : 'Ya me inscribí'}
          </button>
        ))}
      </div>

      <Field id="entry-name" label="Nombre y apellido" error={errors.name}>
        {(a11y) => (
          <input
            {...a11y}
            aria-required="true"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Ana Rojas"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError('name');
            }}
            className={inputClass}
          />
        )}
      </Field>

      <Field
        id="entry-pin"
        label={isRegister ? 'Elige un PIN (4 a 6 números)' : 'Tu PIN'}
        error={errors.pin}
        hint={isRegister ? 'Es solo para volver a entrar si cambias de celular. No lo compartas.' : undefined}
      >
        {(a11y) => (
          <input
            {...a11y}
            aria-required="true"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''));
              clearError('pin');
            }}
            className={inputClass}
          />
        )}
      </Field>

      {isRegister && (
        <Field id="entry-pin-repeat" label="Repite tu PIN" error={errors['pin-repeat']}>
          {(a11y) => (
            <input
              {...a11y}
              aria-required="true"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="new-password"
              value={pinRepeat}
              onChange={(e) => {
                setPinRepeat(e.target.value.replace(/\D/g, ''));
                clearError('pin-repeat');
              }}
              className={inputClass}
            />
          )}
        </Field>
      )}

      {isRegister && enrollment.plusOnes && (
        <fieldset className="flex flex-col gap-3">
          <legend className={`${labelClass} mb-2`}>¿Cuántos acompañantes traes?</legend>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: enrollment.plusOnes.max + 1 }, (_, n) => (
              <label key={n} className="relative">
                <input
                  type="radio"
                  name="plus-count"
                  value={n}
                  checked={plusCount === n}
                  onChange={() => choosePlusCount(n)}
                  className="peer sr-only"
                />
                <span
                  className={`flex h-11 min-w-[3.25rem] cursor-pointer items-center justify-center border border-smoke-700/60 px-4 font-mono text-[11px] uppercase tracking-wider text-paper-100 transition-transform duration-150 ${EASE_OUT} active:scale-[0.97] peer-checked:border-acid-400 peer-checked:bg-acid-400 peer-checked:text-ink-950 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acid-400`}
                >
                  {n === 0 ? 'Ninguno' : n}
                </span>
              </label>
            ))}
          </div>
          {plusCount > 0 && (
            <div className="flex flex-col gap-4">
              {plusNames.map((value, i) => (
                <Reveal key={i}>
                  <Field
                    id={`entry-plus-${i}`}
                    label={`Nombre del acompañante ${plusCount > 1 ? i + 1 : ''}`.trim()}
                    error={i === plusNames.findIndex((n) => !n.trim()) ? errors.plus : undefined}
                  >
                    {(a11y) => (
                      <input
                        {...a11y}
                        aria-required="true"
                        autoComplete="off"
                        autoCapitalize="words"
                        maxLength={ENROLLMENT_LIMITS.plusOneName}
                        value={value}
                        onChange={(e) => {
                          setPlusNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)));
                          clearError('plus');
                        }}
                        className={inputClass}
                      />
                    )}
                  </Field>
                </Reveal>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {isRegister && enrollment.comment && (
        <Field
          id="entry-comment"
          label={enrollment.comment.label}
          optional={!enrollment.comment.required}
          error={errors.comment}
          hint={`${[...comment].length} de ${ENROLLMENT_LIMITS.comment} caracteres`}
        >
          {(a11y) => (
            <textarea
              {...a11y}
              aria-required={enrollment.comment?.required ? 'true' : undefined}
              rows={3}
              maxLength={ENROLLMENT_LIMITS.comment}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                clearError('comment');
              }}
              className={`${inputClass} resize-none`}
            />
          )}
        </Field>
      )}

      {isRegister &&
        enrollment.questions.map((q) => (
          <Field key={q.id} id={`entry-${q.id}`} label={q.label} optional={!q.required} error={errors[q.id]}>
            {(a11y) => (
              <input
                {...a11y}
                aria-required={q.required ? 'true' : undefined}
                maxLength={ENROLLMENT_LIMITS.answer}
                value={answers[q.id] ?? ''}
                onChange={(e) => {
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                  clearError(q.id);
                }}
                className={inputClass}
              />
            )}
          </Field>
        ))}

      {/* Un solo anuncio para lectores de pantalla; cada error visible va junto a su campo. */}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="sr-only">
          {Object.values(errors).join(' ')}
        </p>
      )}
      {isRegister && (enrollment.comment || enrollment.questions.length > 0) && (
        <p className="font-mono text-[10px] tracking-wide text-paper-100/50">
          No escribas aquí RUT, correo, teléfono ni claves.
        </p>
      )}

      {message && (
        <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
          {message}
        </p>
      )}
      {notice && (
        <p role="status" className="border border-smoke-700/60 bg-ink-950 p-3 font-sans text-sm text-paper-100">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={`h-11 bg-acid-400 font-display text-sm uppercase tracking-wider text-ink-950 shadow-glow-acid transition-transform duration-150 ${EASE_OUT} active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-100 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {submitting ? 'Un momento...' : isRegister ? 'Inscribirme y entrar' : 'Entrar'}
      </button>
    </form>
  );
}
