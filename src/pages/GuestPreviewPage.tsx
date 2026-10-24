import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import EventHeader from '../components/EventHeader';
import GuestHubView from '../components/GuestHubView';
import IdentifyForm from '../components/IdentifyForm';
import ThemeScope from '../components/ThemeScope';
import {
  PREVIEW_NOTE_TYPE,
  PREVIEW_READY_TYPE,
  buildPreviewScenario,
  parsePreviewMessage,
  parsePreviewState,
  toPublicPreviewEvent,
  type PreviewDraftPost,
  type PreviewState,
} from '../lib/guestPreview';
import { getMyEvent, type OrganizerEvent } from '../lib/organizerApi';
import { listAllPosts } from '../lib/postsApi';
import type { Post } from '../types';

type Load =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; event: OrganizerEvent; posts: Post[] };

const centered = 'flex min-h-app items-center justify-center bg-ink-950 px-4 py-8 text-paper-100';

function noop() {
  // La vista previa no hace nada: solo muestra.
}

/** La inscripción se ve y se puede escribir en ella, pero no se envía: no hay RPC ni invitado nuevo. */
function blockSubmit(e: FormEvent) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * `/panel/e/:eventId/vista-previa` — lo que ve un invitado, para la organizadora. Se abre dentro de un iframe del
 * panel (`PhoneFrame`) para que las reglas de pantalla (puntos de quiebre, 100dvh, capas fijas) midan un teléfono y
 * no la ventana del panel. Usa el evento y los avisos publicados de ella con su propia sesión; el resto es de
 * ejemplo. No llama a ninguna RPC de invitado y arma el evento público sin `activationCode`.
 */
export default function GuestPreviewPage() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const [search] = useSearchParams();
  const [state, setState] = useState<PreviewState>(() => parsePreviewState(search.get('estado')));
  const [draft, setDraft] = useState<PreviewDraftPost | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyEvent(eventId), listAllPosts(eventId)])
      .then(([event, posts]) => {
        if (cancelled) return;
        setLoad(event ? { status: 'ready', event, posts } : { status: 'missing' });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoad({ status: 'error', message: err instanceof Error ? err.message : 'No pudimos cargar la vista previa.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // El marco del panel manda el estado y el borrador; solo se le hace caso si el mensaje viene de la ventana que
  // contiene esta página y de este mismo origen.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const message = parsePreviewMessage(e.data);
      if (!message) return;
      setState(message.state);
      setDraft(message.draft);
    }
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: PREVIEW_READY_TYPE }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const scenario = useMemo(() => {
    if (load.status !== 'ready') return null;
    return buildPreviewScenario({
      state,
      event: load.event,
      publishedPosts: load.posts.filter((p) => p.publishedAt !== null),
      draft,
      now: new Date(),
    });
  }, [load, state, draft]);

  const note = scenario?.note ?? null;
  useEffect(() => {
    if (!scenario) return;
    window.parent.postMessage({ type: PREVIEW_NOTE_TYPE, note }, window.location.origin);
  }, [scenario, note]);

  if (load.status === 'loading') {
    return (
      <div className={centered}>
        <span className="font-mono text-xs uppercase tracking-widest text-paper-100/70">Cargando...</span>
      </div>
    );
  }
  if (load.status === 'missing') {
    return (
      <div className={centered}>
        <p role="alert" className="max-w-xs text-center font-mono text-xs uppercase tracking-wider">
          Este evento no existe o no es tuyo.
        </p>
      </div>
    );
  }
  if (load.status === 'error' || !scenario) {
    return (
      <div className={centered}>
        <p role="alert" className="max-w-xs text-center font-mono text-xs uppercase tracking-wider text-flame-500">
          {load.status === 'error' ? load.message : 'No pudimos cargar la vista previa.'}
        </p>
      </div>
    );
  }

  const { event } = load;
  const publicEvent = toPublicPreviewEvent(event);

  if (scenario.screen === 'identify') {
    return (
      <ThemeScope theme={event.theme}>
        <div className={centered} onSubmitCapture={blockSubmit}>
          <IdentifyForm slug={event.slug} event={publicEvent} onIdentified={noop} />
        </div>
      </ThemeScope>
    );
  }

  return (
    <ThemeScope theme={event.theme}>
      <div className="flex min-h-app flex-col items-center gap-5 bg-ink-950 px-4 pb-16 pt-8 text-paper-100">
        <EventHeader event={publicEvent} guestName={scenario.guestFirstName} />
        <GuestHubView
          cameraUnlock={publicEvent.cameraUnlock}
          cameraUnlocked={scenario.cameraUnlocked}
          cameraReady
          headcount={scenario.headcount}
          quota={scenario.quota}
          posts={scenario.posts}
          revealed={scenario.revealed}
          refreshing={false}
          onOpenCamera={noop}
          onShowQr={noop}
          onRefresh={noop}
        />
      </div>
    </ThemeScope>
  );
}
