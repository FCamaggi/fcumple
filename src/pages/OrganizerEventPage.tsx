import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { checkInGuest } from '../lib/adminApi';
import CameraStudio from '../components/studio/CameraStudio';
import DoorPanel from '../components/DoorPanel';
import ActivationTab from '../components/ActivationTab';
import EnrollmentSettings from '../components/EnrollmentSettings';
import GuestPreviewTab from '../components/GuestPreviewTab';
import PanelTabs from '../components/PanelTabs';
import PartyDayTab from '../components/PartyDayTab';
import PostsPanel from '../components/PostsPanel';
import ThemeScope from '../components/ThemeScope';
import { useEventPhotos } from '../hooks/useEventPhotos';
import { QUESTION_IDS } from '../lib/enrollmentConfig';
import { isPartyDay } from '../lib/partyDay';
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
  | 'hoy'
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
  { id: 'hoy', label: 'Hoy' },
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
  // Las fotos viven aquí, no en cada pestaña: así la insignia de «Fotos» se ve desde cualquier pestaña y «Fotos» y
  // «Hoy» muestran lo mismo con una sola petición.
  const photos = useEventPhotos(event ?? null, setEvent);

  // Sin sondeo: las fotos se vuelven a pedir al cambiar de pestaña (y con «Actualizar» en «Hoy»).
  function selectTab(next: Tab) {
    setTab(next);
    photos.reload();
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyEvent(eventId), listEventGuests(eventId)])
      .then(([ev, list]) => {
        if (cancelled) return;
        setEvent(ev);
        setGuests(list);
        // El día de la fiesta el panel abre en lo que se necesita ahí; otros días, en la lista de invitados.
        if (ev && isPartyDay(ev.startsAt, new Date())) setTab('hoy');
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No pudimos cargar el evento.');
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // «Actualizar» de la pestaña «Hoy»: si no se puede, se queda con la lista que ya tenía.
  const refreshGuests = useCallback(() => {
    listEventGuests(eventId)
      .then(setGuests)
      .catch(() => undefined);
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

  // Si no se pudieron leer las fotos, mejor sin cuenta que con una que podría estar vieja.
  const tabs = TABS.map((t) =>
    t.id === 'fotos' && photos.photos !== null && !photos.error
      ? { ...t, badge: { count: photos.counts.pending, hint: 'por revisar' } }
      : t,
  );

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

          <PanelTabs tabs={tabs} active={tab} onSelect={selectTab} />

          {tab === 'hoy' && (
            <PartyDayTab
              event={event}
              guests={guests}
              photos={photos}
              onOpenTab={selectTab}
              onRefresh={refreshGuests}
            />
          )}

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
          {tab === 'fotos' && <PhotosTab photos={photos} />}
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
