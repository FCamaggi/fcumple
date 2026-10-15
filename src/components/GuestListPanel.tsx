import { useState } from 'react';
import type { AddGuestsResult, OrganizerGuest } from '../lib/organizerApi';

interface GuestListPanelProps {
  guests: OrganizerGuest[];
  onAdd: (names: string[]) => Promise<AddGuestsResult>;
  onReview: (guest: OrganizerGuest, decision: 'approved' | 'rejected') => Promise<void>;
  onRemove: (guest: OrganizerGuest) => Promise<void>;
  onRegenerate: (guest: OrganizerGuest) => Promise<void>;
}

const buttonClass = 'h-8 border border-smoke-700/60 px-3 font-mono text-[11px] uppercase tracking-wider text-paper-100';

/**
 * Lista de invitados del evento. Cada persona se registra por nombre y
 * apellido (no se guarda ningún RUT). Las solicitudes de acceso pendientes
 * aparecen arriba para aprobarlas o rechazarlas.
 */
export default function GuestListPanel({ guests, onAdd, onReview, onRemove, onRegenerate }: GuestListPanelProps) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; lines: string[] } | null>(null);

  const pending = guests.filter((g) => g.approvalStatus === 'pending');
  const members = guests.filter((g) => g.approvalStatus !== 'pending');
  const entered = members.filter((g) => g.claimedAt).length;

  async function run(action: () => Promise<void>) {
    try {
      await action();
      setFeedback(null);
    } catch (err) {
      setFeedback({ kind: 'error', lines: [err instanceof Error ? err.message : 'No pudimos hacer el cambio.'] });
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const names = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    setAdding(true);
    try {
      const result = await onAdd(names);
      if (result.failed.length === 0) {
        setText('');
        setFeedback({ kind: 'ok', lines: [`Agregaste ${result.created.length} invitado(s).`] });
      } else {
        // Se dejan en el cuadro solo las líneas que fallaron, para corregirlas.
        setText(result.failed.map((f) => f.name).join('\n'));
        setFeedback({
          kind: 'error',
          lines: [
            `Agregaste ${result.created.length}; ${result.failed.length} no se pudieron agregar:`,
            ...result.failed.map((f) => `${f.name}: ${f.reason}`),
          ],
        });
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {pending.length > 0 && (
        <section aria-label="Solicitudes de acceso" className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-hotpink-500">
            Solicitudes de acceso ({pending.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((guest) => (
              <li key={guest.id} className="flex items-center justify-between gap-2 bg-ink-900 px-3 py-2">
                <span className="font-sans text-sm text-paper-100">{guest.fullName}</span>
                <span className="flex gap-2">
                  <button type="button" className={buttonClass} onClick={() => void run(() => onReview(guest, 'approved'))}>
                    Aprobar
                  </button>
                  <button type="button" className={buttonClass} onClick={() => void run(() => onReview(guest, 'rejected'))}>
                    Rechazar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-2" aria-label="Alta de invitados">
        <label htmlFor="guest-names" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
          Agregar invitados (un nombre y apellido por línea)
        </label>
        <textarea
          id="guest-names"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Ana Rojas\nPedro Pascal'}
          className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
        />
        <button
          type="submit"
          disabled={adding || !text.trim()}
          className="h-10 w-fit bg-acid-400 px-4 font-display text-xs uppercase tracking-wider text-ink-950 disabled:opacity-60"
        >
          {adding ? 'Agregando...' : 'Agregar'}
        </button>
      </form>

      {feedback && (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`flex flex-col gap-1 font-mono text-[11px] uppercase tracking-wide ${
            feedback.kind === 'error' ? 'text-flame-500' : 'text-acid-400'
          }`}
        >
          {feedback.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}

      <section aria-label="Invitados" className="flex flex-col gap-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-laser-500">
          Invitados: {members.length} · han entrado: {entered}
        </h2>
        {members.length === 0 ? (
          <p className="font-sans text-sm text-paper-100/60">Todavía no hay invitados. Agrega los primeros arriba.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {members.map((guest) => (
              <li key={guest.id} className="flex flex-wrap items-center justify-between gap-2 bg-ink-900 px-3 py-2">
                <span className="flex flex-col">
                  <span className="font-sans text-sm text-paper-100">{guest.fullName}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-paper-100/50">
                    {guest.approvalStatus === 'rejected'
                      ? 'Rechazado'
                      : guest.checkedInAt
                        ? 'Llegó'
                        : guest.claimedAt
                          ? 'Entró'
                          : 'Aún no entra'}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      if (window.confirm(`¿Cerrar la sesión de ${guest.fullName}? Tendrá que identificarse de nuevo.`)) {
                        void run(() => onRegenerate(guest));
                      }
                    }}
                  >
                    Regenerar acceso
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      if (window.confirm(`¿Quitar a ${guest.fullName} de la lista?`)) {
                        void run(() => onRemove(guest));
                      }
                    }}
                  >
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
