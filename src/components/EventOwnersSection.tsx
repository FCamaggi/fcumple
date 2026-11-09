import { useEffect, useState } from 'react';
import { createOwnerInvite, listEventOwners, type EventOwner } from '../lib/organizerApi';

interface EventOwnersSectionProps {
  eventId: string;
}

const fieldClass =
  'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none focus-visible:ring-2 focus-visible:ring-acid-400';
const labelClass = 'font-mono text-xs uppercase tracking-wider text-paper-100/70';

/**
 * Sección «Dueños» dentro de Ajustes del evento: lista las cuentas dueñas del
 * evento y permite generar un link de invitación de un solo uso (vence en 7 días).
 */
export default function EventOwnersSection({ eventId }: EventOwnersSectionProps) {
  const [owners, setOwners] = useState<EventOwner[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setInviteUrl(null);
    setCopied(false);

    listEventOwners(eventId)
      .then((list) => {
        if (!cancelled) setOwners(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No pudimos cargar los dueños del evento.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function handleGenerateInvite() {
    setError(null);
    setCopied(false);
    setGenerating(true);
    try {
      const token = await createOwnerInvite(eventId);
      setInviteUrl(`${window.location.origin}/panel/unirse/${token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos generar el link de invitación. Intenta de nuevo.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="ev-owners-heading" className="flex flex-col gap-3 border-t border-smoke-700/40 pt-4">
      <h2 id="ev-owners-heading" className={labelClass}>
        Dueños
      </h2>

      {owners.length > 0 && (
        <ul className="flex flex-col gap-1">
          {owners.map((owner) => (
            <li
              key={owner.userId}
              className="flex flex-wrap items-center justify-between gap-2 bg-ink-900 px-3 py-2"
            >
              <span className="break-all font-sans text-sm text-paper-100">{owner.email}</span>
              {(owner.isMe || owner.isCreator) && (
                <span className="flex flex-wrap gap-1.5">
                  {owner.isMe && (
                    <span className="border border-acid-400/60 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-acid-400">
                      Tú
                    </span>
                  )}
                  {owner.isCreator && (
                    <span className="border border-laser-500/60 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-laser-500">
                      Creador
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!inviteUrl && (
        <p className="font-sans text-xs text-paper-100/60">
          Cada link sirve para una sola persona: genera uno por cada dueño que quieras sumar.
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleGenerateInvite()}
        disabled={generating}
        className="h-11 border border-smoke-700/60 px-3 font-mono text-xs uppercase tracking-wider text-paper-100 disabled:opacity-60"
      >
        {generating ? 'Generando...' : inviteUrl ? 'Generar otro link' : 'Generar link de invitación'}
      </button>

      {inviteUrl && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              aria-label="Link de invitación"
              value={inviteUrl}
              className={`${fieldClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="h-11 shrink-0 border border-acid-400 px-4 font-mono text-xs uppercase tracking-wider text-acid-400"
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="font-sans text-xs text-paper-100/60">
            Sirve para una sola persona y vence en 7 días. Para sumar a otra, genera otro link.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}
    </section>
  );
}
