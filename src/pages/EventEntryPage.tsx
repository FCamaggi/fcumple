import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import IdentifyForm from '../components/IdentifyForm';
import {
  clearGuestSession,
  getEventPublic,
  getMyGuest,
  loadGuestSession,
  saveGuestSession,
  type EventPublic,
  type GuestSession,
  type MyGuest,
} from '../lib/platformApi';

type State =
  | { phase: 'loading' }
  | { phase: 'missing' }
  | { phase: 'error'; message: string }
  | { phase: 'identify'; event: EventPublic }
  | { phase: 'inside'; event: EventPublic; guest: MyGuest };

const shell = 'flex min-h-screen items-center justify-center bg-ink-950 px-4 text-paper-100';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso));
}

/**
 * `/e/:slug` — el enlace único del evento. Si este dispositivo ya tiene una
 * sesión válida entra directo; si no, pide identificarse.
 *
 * Etapa 2 (en curso): esta pantalla cubre la entrada. El hub del evento
 * (cámara, rollo, avisos) todavía usa las RPC de la Fase 0 y se migra aparte.
 */
export default function EventEntryPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const event = await getEventPublic(slug);
        if (cancelled) return;
        if (!event) {
          setState({ phase: 'missing' });
          return;
        }

        const stored = loadGuestSession(slug);
        if (stored) {
          const guest = await getMyGuest(stored.token);
          if (cancelled) return;
          if (guest) {
            setState({ phase: 'inside', event, guest });
            return;
          }
          // Token vencido o invitado rechazado: se descarta y se pide de nuevo.
          clearGuestSession(slug);
        }
        setState({ phase: 'identify', event });
      } catch (err) {
        if (!cancelled) {
          setState({ phase: 'error', message: err instanceof Error ? err.message : 'Algo salió mal.' });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleIdentified(event: EventPublic, session: GuestSession) {
    saveGuestSession(slug, session);
    const guest = await getMyGuest(session.token);
    if (guest) {
      setState({ phase: 'inside', event, guest });
    } else {
      clearGuestSession(slug);
      setState({ phase: 'error', message: 'No pudimos abrir tu sesión. Intenta de nuevo.' });
    }
  }

  switch (state.phase) {
    case 'loading':
      return (
        <div className={shell}>
          <span className="font-mono text-xs uppercase tracking-widest text-acid-400">Cargando...</span>
        </div>
      );
    case 'missing':
      return (
        <div className={shell}>
          <p role="alert" className="max-w-xs text-center font-mono text-xs uppercase tracking-wider">
            Este evento no existe o el enlace está mal escrito.
          </p>
        </div>
      );
    case 'error':
      return (
        <div className={shell}>
          <p role="alert" className="max-w-xs text-center font-mono text-xs uppercase tracking-wider text-flame-500">
            {state.message}
          </p>
        </div>
      );
    case 'identify':
      return (
        <div className={shell}>
          <IdentifyForm slug={slug} event={state.event} onIdentified={(session) => void handleIdentified(state.event, session)} />
        </div>
      );
    case 'inside': {
      const date = formatDate(state.event.startsAt);
      return (
        <div className={shell}>
          <main className="flex w-full max-w-sm flex-col gap-3 border border-smoke-700/40 bg-ink-900 p-6 text-center shadow-2xl">
            <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">{state.event.name}</span>
            <h1 className="font-display text-3xl uppercase tracking-wide">Hola, {state.guest.fullName.split(' ')[0]}</h1>
            {date && <p className="font-sans text-sm text-paper-100/80">{date}</p>}
            {state.event.location && <p className="font-sans text-sm text-paper-100/80">{state.event.location}</p>}
            <p className="font-mono text-[11px] uppercase tracking-wide text-acid-400">Ya estás dentro</p>
          </main>
        </div>
      );
    }
  }
}
