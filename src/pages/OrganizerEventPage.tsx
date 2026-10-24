import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { checkInGuest } from '../lib/adminApi';
import CameraStudio from '../components/studio/CameraStudio';
import DoorPanel from '../components/DoorPanel';
import ActivationTab from '../components/ActivationTab';
import EnrollmentSettings from '../components/EnrollmentSettings';
import GuestPreviewTab from '../components/GuestPreviewTab';
import PanelTabs from '../components/PanelTabs';
import PostsPanel from '../components/PostsPanel';
import ThemeScope from '../components/ThemeScope';
import { QUESTION_IDS } from '../lib/enrollmentConfig';
import EventSettingsPanel from '../components/EventSettingsPanel';
import GuestListPanel from '../components/GuestListPanel';
import PhotosTab from '../components/PhotosTab';
import QrScanner from '../components/QrScanner';
import ShareEventLink from '../components/ShareEventLink';
import {
  addGuests,
  getMyEvent,
  listEventGuests,
  regenerateGuestToken,
  removeGuest,
  setGuestApproval,
  setGuestPlusOnes,
  updateEvent,
  type EventSettingsPatch,
  type OrganizerEvent,
  type OrganizerGuest,
} from '../lib/organizerApi';

type Tab =
  | 'invitados'
  | 'avisos'
  | 'fotos'
  | 'activacion'
  | 'camara'
  | 'vista'
  | 'enlace'
  | 'inscripcion'
  | 'puerta'
  | 'ajustes';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'invitados', label: 'Invitados' },
  { id: 'avisos', label: 'Avisos' },
  { id: 'fotos', label: 'Fotos' },
  { id: 'activacion', label: 'Activación' },
  { id: 'camara', label: 'Cámara' },
  { id: 'vista', label: 'Vista previa' },
  { id: 'enlace', label: 'Enlace' },
  { id: 'inscripcion', label: 'Inscripción' },
  { id: 'puerta', label: 'Puerta' },
  { id: 'ajustes', label: 'Ajustes' },
];

const shell = 'min-h-app bg-ink-950 px-4 py-8 text-paper-100';

/** `/panel/e/:eventId` — gestión de un evento: invitados, enlace único y ajustes. */
export default function OrganizerEventPage() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<OrganizerEvent | null | undefined>(undefined);
  const [guests, setGuests] = useState<OrganizerGuest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('invitados');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyEvent(eventId), listEventGuests(eventId)])
      .then(([ev, list]) => {
        if (cancelled) return;
        setEvent(ev);
        setGuests(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No pudimos cargar el evento.');
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const replaceGuest = useCallback((updated: OrganizerGuest) => {
    setGuests((current) => current.map((g) => (g.id === updated.id ? updated : g)));
  }, []);

  if (error) {
    return (
      <div className={shell}>
        <p role="alert" className="font-mono text-xs uppercase tracking-wider text-flame-500">
          {error}
        </p>
      </div>
    );
  }

  if (event === undefined) {
    return (
      <div className={shell}>
        <p className="font-mono text-xs uppercase tracking-widest text-acid-400">Cargando...</p>
      </div>
    );
  }

  if (event === null) {
    return (
      <div className={shell}>
        <p role="alert" className="font-mono text-xs uppercase tracking-wider">
          Este evento no existe o no es tuyo.
        </p>
      </div>
    );
  }

  async function handleSave(patch: EventSettingsPatch) {
    setEvent(await updateEvent(eventId, patch));
  }

  return (
    <ThemeScope theme={event.theme}>
      <div className={shell}>
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <header className="flex flex-col gap-1">
            <Link to="/panel" className="inline-flex min-h-11 items-center font-mono text-xs uppercase tracking-wider text-paper-100/60 underline">
              ← Tus eventos
            </Link>
            <h1 className="font-display text-3xl uppercase tracking-wide">{event.name}</h1>
          </header>

          <PanelTabs tabs={TABS} active={tab} onSelect={setTab} />

          {tab === 'invitados' && (
            <GuestListPanel
              guests={guests}
              enrollment={event.enrollment}
              slug={event.slug}
              onAdd={async (names) => {
                const result = await addGuests(eventId, names, event.defaultPhotoQuota);
                setGuests((current) => [...current, ...result.created]);
                return result;
              }}
              onReview={async (guest, decision) => replaceGuest(await setGuestApproval(guest.id, decision))}
              onReviewPlusOnes={async (guest, approve) => replaceGuest(await setGuestPlusOnes(guest, approve))}
              onRemove={async (guest) => {
                await removeGuest(guest.id);
                setGuests((current) => current.filter((g) => g.id !== guest.id));
              }}
              onRegenerate={async (guest) => replaceGuest(await regenerateGuestToken(guest.id))}
            />
          )}
          {tab === 'puerta' && (
            <DoorPanel
              guests={guests}
              onOpenScanner={() => setScanning(true)}
              onCheckIn={async (guest) => {
                const checked = await checkInGuest(guest.token);
                replaceGuest({ ...guest, checkedInAt: checked.checkedInAt });
              }}
            />
          )}
          {tab === 'avisos' && <PostsPanel eventId={event.id} />}
          {tab === 'activacion' && <ActivationTab event={event} onEventChange={setEvent} />}
          {tab === 'camara' && <CameraStudio event={event} onEventChange={setEvent} />}
          {tab === 'fotos' && <PhotosTab event={event} onEventChange={setEvent} />}
          {tab === 'vista' && <GuestPreviewTab event={event} />}
          {tab === 'enlace' && <ShareEventLink event={event} />}
          {tab === 'inscripcion' && (
            <EnrollmentSettings
              event={event}
              onSave={handleSave}
              usedQuestionIds={QUESTION_IDS.filter((id) => guests.some((g) => g.answers[id]))}
            />
          )}
          {tab === 'ajustes' && <EventSettingsPanel event={event} onSave={handleSave} />}
        </div>

        {scanning && (
          <QrScanner
            // El escáner de la Fase 0 espera invitados con token y llegada;
            // se le pasa lo mínimo que usa.
            guests={guests.map((g) => ({
              id: g.id,
              token: g.token,
              fullName: g.fullName,
              status: g.status,
              plusOnesAllowed: g.plusOnesAllowed,
              plusOnesConfirmed: g.plusOnesConfirmed,
              guestNote: null,
              respondedAt: null,
              checkedInAt: g.checkedInAt,
            }))}
            onCheckedIn={(checked) =>
              setGuests((current) =>
                current.map((g) => (g.id === checked.id ? { ...g, checkedInAt: checked.checkedInAt } : g)),
              )
            }
            onClose={() => setScanning(false)}
          />
        )}
      </div>
    </ThemeScope>
  );
}
