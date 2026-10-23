import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createEvent, listMyEvents, type OrganizerEvent } from '../lib/organizerApi';
import { signOut } from '../lib/auth';

const shell = 'min-h-screen bg-ink-950 px-4 py-8 text-paper-100';

/** `/panel` — los eventos del organizador y el alta de uno nuevo. */
export default function OrganizerEventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<OrganizerEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMyEvents()
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No pudimos cargar tus eventos.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const event = await createEvent({ name: name.trim() });
      navigate(`/panel/e/${event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos crear el evento.');
      setCreating(false);
    }
  }

  return (
    <div className={shell}>
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <header className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">Organizador</span>
            <h1 className="font-display text-3xl uppercase tracking-wide">Tus eventos</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/panel/cuenta" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/60 underline">
              Tu cuenta
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="font-mono text-[11px] uppercase tracking-wider text-paper-100/60 underline"
            >
              Salir
            </button>
          </div>
        </header>

        {error && (
          <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
            {error}
          </p>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-2" aria-label="Nuevo evento">
          <label htmlFor="new-event-name" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
            Nombre del nuevo evento
          </label>
          <input
            id="new-event-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cumpleaños de Ana"
            className="bg-ink-900 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="h-11 bg-acid-400 font-display text-sm uppercase tracking-wider text-ink-950 disabled:opacity-60"
          >
            {creating ? 'Creando...' : 'Crear evento'}
          </button>
        </form>

        {events === null && !error && (
          <p className="font-mono text-xs uppercase tracking-widest text-acid-400">Cargando...</p>
        )}

        {events && events.length === 0 && (
          <p className="font-sans text-sm text-paper-100/60">Todavía no tienes eventos. Crea el primero arriba.</p>
        )}

        {events && events.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Eventos">
            {events.map((event) => (
              <li key={event.id}>
                <Link to={`/panel/e/${event.id}`} className="flex flex-col bg-ink-900 px-4 py-3 hover:bg-ink-900/70">
                  <span className="font-display text-lg uppercase tracking-wide">{event.name}</span>
                  <span className="font-mono text-[11px] tracking-wide text-paper-100/50">/e/{event.slug}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
