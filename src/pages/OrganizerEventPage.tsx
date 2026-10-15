import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EventSettingsPanel from '../components/EventSettingsPanel';
import GuestListPanel from '../components/GuestListPanel';
import ShareEventLink from '../components/ShareEventLink';
import {
  addGuests,
  getMyEvent,
  listEventGuests,
  regenerateGuestToken,
  removeGuest,
  setGuestApproval,
  updateEvent,
  type EventSettingsPatch,
  type OrganizerEvent,
  type OrganizerGuest,
} from '../lib/organizerApi';

type Tab = 'invitados' | 'enlace' | 'ajustes';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'invitados', label: 'Invitados' },
  { id: 'enlace', label: 'Enlace' },
  { id: 'ajustes', label: 'Ajustes' },
];

const shell = 'min-h-screen bg-ink-950 px-4 py-8 text-paper-100';

/** `/panel/e/:eventId` — gestión de un evento: invitados, enlace único y ajustes. */
export default function OrganizerEventPage() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<OrganizerEvent | null | undefined>(undefined);
  const [guests, setGuests] = useState<OrganizerGuest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('invitados');

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
    <div className={shell}>
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Link to="/panel" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/60 underline">
            ← Tus eventos
          </Link>
          <h1 className="font-display text-3xl uppercase tracking-wide">{event.name}</h1>
        </header>

        <nav className="flex gap-2" aria-label="Secciones">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={`h-9 px-4 font-mono text-[11px] uppercase tracking-wider ${
                tab === t.id ? 'bg-acid-400 text-ink-950' : 'border border-smoke-700/60 text-paper-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'invitados' && (
          <GuestListPanel
            guests={guests}
            onAdd={async (names) => {
              const result = await addGuests(eventId, names);
              setGuests((current) => [...current, ...result.created]);
              return result;
            }}
            onReview={async (guest, decision) => replaceGuest(await setGuestApproval(guest.id, decision))}
            onRemove={async (guest) => {
              await removeGuest(guest.id);
              setGuests((current) => current.filter((g) => g.id !== guest.id));
            }}
            onRegenerate={async (guest) => replaceGuest(await regenerateGuestToken(guest.id))}
          />
        )}
        {tab === 'enlace' && <ShareEventLink event={event} />}
        {tab === 'ajustes' && <EventSettingsPanel event={event} onSave={handleSave} />}
      </div>
    </div>
  );
}
