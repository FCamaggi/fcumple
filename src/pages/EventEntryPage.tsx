import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import EventHeader from '../components/EventHeader';
import GuestHub from '../components/GuestHub';
import IdentifyForm from '../components/IdentifyForm';
import ThemeScope from '../components/ThemeScope';
import {
  activateCamera,
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
  | { phase: 'inside'; event: EventPublic; guest: MyGuest; token: string };

const centered = 'flex min-h-app items-center justify-center bg-ink-950 px-4 py-8 text-paper-100';

/** El código del QR de la fiesta: `/e/:slug/a/:code`. Cualquier otra cola del enlace se ignora. */
function activationCodeFrom(splat: string | undefined): string | undefined {
  return /^a\/([A-Za-z0-9]{8,64})\/?$/.exec(splat ?? '')?.[1];
}

/**
 * `/e/:slug` — el enlace único del evento. Si este dispositivo ya tiene una
 * sesión válida entra directo al hub; si no, pide identificarse.
 *
 * `/e/:slug/a/:code` es el QR impreso de la fiesta: al escanearlo con la cámara
 * del teléfono, quien ya tiene sesión activa su cámara en el acto, y quien no,
 * se inscribe (o entra) y se activa apenas está dentro. El código se quita de la
 * dirección una vez usado.
 */
export default function EventEntryPage() {
  const params = useParams<{ slug: string; '*': string }>();
  const slug = params.slug ?? '';
  // El código se guarda al montar y se quita de la dirección de inmediato: así no queda en la barra, en el
  // historial ni viaja en un Referer mientras la persona se inscribe.
  const [code] = useState(() => activationCodeFrom(params['*']));
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [activation, setActivation] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const activationTried = useRef(false);

  useEffect(() => {
    if (code) navigate(`/e/${slug}`, { replace: true });
    // Solo al montar: el código ya quedó guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            setState({ phase: 'inside', event, guest, token: stored.token });
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

  // Activa la cámara con el código del QR en cuanto el invitado está dentro.
  useEffect(() => {
    if (!code || state.phase !== 'inside' || activationTried.current) return;
    activationTried.current = true;
    const { event, token } = state;

    void (async () => {
      try {
        if (await activateCamera(token, code)) {
          const fresh = await getMyGuest(token);
          if (fresh) setState({ phase: 'inside', event, guest: fresh, token });
          setActivation({ kind: 'ok', text: '¡Cámara activada! Ya puedes sacar fotos.' });
        } else {
          setActivation({
            kind: 'error',
            text: 'Este código ya no sirve. Pregunta a quien organiza por el código de la fiesta.',
          });
        }
      } catch (err) {
        setActivation({ kind: 'error', text: err instanceof Error ? err.message : 'No pudimos activar la cámara.' });
      }
    })();
  }, [code, state]);

  async function handleIdentified(event: EventPublic, session: GuestSession) {
    saveGuestSession(slug, session);
    const guest = await getMyGuest(session.token);
    if (guest) {
      setState({ phase: 'inside', event, guest, token: session.token });
    } else {
      clearGuestSession(slug);
      setState({ phase: 'error', message: 'No pudimos abrir tu sesión. Intenta de nuevo.' });
    }
  }

  switch (state.phase) {
    case 'loading':
      return (
        <div className={centered}>
          <span className="font-mono text-xs uppercase tracking-widest text-paper-100/70">Cargando...</span>
        </div>
      );
    case 'missing':
      return (
        <div className={centered}>
          <p role="alert" className="max-w-xs text-center font-mono text-xs uppercase tracking-wider">
            Este evento no existe o el enlace está mal escrito.
          </p>
        </div>
      );
    case 'error':
      return (
        <div className={centered}>
          <p role="alert" className="max-w-xs text-center font-mono text-xs uppercase tracking-wider text-flame-500">
            {state.message}
          </p>
        </div>
      );
    case 'identify':
      return (
        <ThemeScope theme={state.event.theme}>
          <div className={centered}>
            <IdentifyForm
              slug={slug}
              event={state.event}
              onIdentified={(session) => void handleIdentified(state.event, session)}
            />
          </div>
        </ThemeScope>
      );
    case 'inside': {
      const { event, guest, token } = state;
      return (
        <ThemeScope theme={event.theme}>
          <div className="flex min-h-app flex-col items-center gap-5 bg-ink-950 px-4 pb-16 pt-8 text-paper-100">
            <EventHeader event={event} guestName={guest.fullName} />
            {activation && (
              <p
                role={activation.kind === 'error' ? 'alert' : 'status'}
                className={`w-full max-w-md border px-3 py-2 font-mono text-xs uppercase tracking-wide ${
                  activation.kind === 'error' ? 'border-flame-500 text-flame-500' : 'border-acid-400 text-acid-400'
                }`}
              >
                {activation.text}
              </p>
            )}
            <GuestHub
              slug={slug}
              token={token}
              event={event}
              guest={guest}
              onGuestChange={(fresh) => setState({ phase: 'inside', event, guest: fresh, token })}
            />
          </div>
        </ThemeScope>
      );
    }
  }
}
