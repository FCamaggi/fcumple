import { useMemo, useState } from 'react';
import type { OrganizerGuest } from '../lib/organizerApi';

interface DoorPanelProps {
  guests: OrganizerGuest[];
  onCheckIn: (guest: OrganizerGuest) => Promise<void>;
  onOpenScanner: () => void;
}

/** Sin tildes y en minúsculas, para que "perez" encuentre a "Pérez". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * DoorPanel — la puerta del evento: marcar la llegada buscando por nombre, o
 * abrir el escáner de QR (el código que cada invitado muestra en su celular).
 * Solo cuentan los invitados aprobados.
 */
export default function DoorPanel({ guests, onCheckIn, onOpenScanner }: DoorPanelProps) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approved = useMemo(() => guests.filter((g) => g.approvalStatus === 'approved'), [guests]);
  const arrived = approved.filter((g) => g.checkedInAt).length;

  const matches = useMemo(() => {
    const needle = fold(query).trim();
    if (!needle) return [];
    const words = needle.split(/\s+/);
    return approved.filter((g) => {
      const name = fold(g.fullName);
      return words.every((w) => name.includes(w));
    });
  }, [approved, query]);

  async function handleCheckIn(guest: OrganizerGuest) {
    setError(null);
    setBusyId(guest.id);
    try {
      await onCheckIn(guest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos marcar la llegada.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-laser-500">
          Han llegado: {arrived} de {approved.length}
        </h2>
        <button
          type="button"
          onClick={onOpenScanner}
          className="h-10 bg-acid-400 px-4 font-display text-xs uppercase tracking-wider text-ink-950"
        >
          Abrir escáner
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="door-search" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
          Buscar por nombre
        </label>
        <input
          id="door-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ana Rojas"
          className="bg-ink-900 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}

      {query.trim() && matches.length === 0 && (
        <p className="font-sans text-sm text-paper-100/60">No encontramos a nadie con ese nombre en la lista.</p>
      )}

      {matches.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Resultados">
          {matches.map((guest) => (
            <li key={guest.id} className="flex items-center justify-between gap-2 bg-ink-900 px-3 py-2">
              <span className="font-sans text-sm text-paper-100">{guest.fullName}</span>
              {guest.checkedInAt ? (
                <span className="font-mono text-[11px] uppercase tracking-wider text-acid-400">Ya llegó</span>
              ) : (
                <button
                  type="button"
                  disabled={busyId === guest.id}
                  onClick={() => void handleCheckIn(guest)}
                  className="h-8 border border-acid-400 px-3 font-mono text-[11px] uppercase tracking-wider text-acid-400 disabled:opacity-60"
                >
                  {busyId === guest.id ? 'Marcando...' : 'Marcar llegada'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
