import { useState } from 'react';
import type { AddGuestsResult, OrganizerGuest } from '../lib/organizerApi';
import { QUESTION_IDS, type ResolvedEnrollment } from '../lib/enrollmentConfig';
import { enrollmentToCsv } from '../lib/csv';
import { downloadCsv } from '../lib/downloadCsv';

interface GuestListPanelProps {
  guests: OrganizerGuest[];
  /** Lo que se le pide al invitado al inscribirse: da el nombre de cada pregunta. */
  enrollment: ResolvedEnrollment;
  /** Para nombrar el archivo del CSV. */
  slug: string;
  onAdd: (names: string[]) => Promise<AddGuestsResult>;
  onReview: (guest: OrganizerGuest, decision: 'approved' | 'rejected') => Promise<void>;
  /** Resuelve la solicitud de acompañantes de un invitado ya aprobado. */
  onReviewPlusOnes: (guest: OrganizerGuest, approve: boolean) => Promise<void>;
  onRemove: (guest: OrganizerGuest) => Promise<void>;
  onRegenerate: (guest: OrganizerGuest) => Promise<void>;
}

const buttonClass = 'h-8 border border-smoke-700/60 px-3 font-mono text-xs uppercase tracking-wider text-paper-100';

/** Pares «pregunta → respuesta» de un invitado, con las preguntas del organizador. */
function answerRows(guest: OrganizerGuest, enrollment: ResolvedEnrollment): Array<{ key: string; question: string; answer: string }> {
  const rows: Array<{ key: string; question: string; answer: string }> = [];
  const { answers } = guest;
  if (answers.plus_ones?.length) rows.push({ key: 'plus', question: 'Acompañantes', answer: answers.plus_ones.join(', ') });
  if (answers.comment) rows.push({ key: 'comment', question: enrollment.comment?.label ?? 'Comentario', answer: answers.comment });
  for (const id of QUESTION_IDS) {
    const value = answers[id];
    if (!value) continue;
    const question = enrollment.questions.find((q) => q.id === id);
    // Una pregunta que el organizador quitó después: la respuesta existe, no se esconde.
    rows.push({ key: id, question: question?.label ?? 'Pregunta que ya no está', answer: value });
  }
  return rows;
}

/** Acompañantes: pendientes (una solicitud) o ya aprobados. Nada si no hay. */
function PlusOnesBadge({ guest }: { guest: OrganizerGuest }) {
  const pending = guest.plusOnesRequested > guest.plusOnesConfirmed;
  if (pending) {
    return (
      <span
        className="font-mono text-xs uppercase tracking-wide text-hotpink-500"
        aria-label={`Solicita ${guest.plusOnesRequested} acompañante${guest.plusOnesRequested === 1 ? '' : 's'}, sin aprobar`}
      >
        Solicita +{guest.plusOnesRequested}
      </span>
    );
  }
  if (guest.plusOnesConfirmed > 0) {
    return (
      <span
        className="font-mono text-xs text-laser-500"
        aria-label={`${guest.plusOnesConfirmed} acompañante${guest.plusOnesConfirmed === 1 ? '' : 's'} aprobado${guest.plusOnesConfirmed === 1 ? '' : 's'}`}
      >
        +{guest.plusOnesConfirmed}
      </span>
    );
  }
  return null;
}

function AnswersDetail({ guest, enrollment }: { guest: OrganizerGuest; enrollment: ResolvedEnrollment }) {
  const rows = answerRows(guest, enrollment);
  if (rows.length === 0) return null;
  return (
    <details className="w-full">
      <summary className="flex min-h-11 cursor-pointer items-center font-mono text-xs uppercase tracking-wide text-paper-100/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-400">
        Ver respuestas ({rows.length})
      </summary>
      <dl className="mt-2 flex flex-col gap-2">
        {rows.map(({ key, question, answer }) => (
          <div key={key} className="flex flex-col">
            <dt className="font-mono text-xs uppercase tracking-wide text-paper-100/50">{question}</dt>
            <dd className="whitespace-pre-line font-sans text-sm text-paper-100">{answer}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/**
 * Invitados del evento. Cada persona se inscribe sola con el enlace (nombre y
 * apellido + un PIN que elige); también se puede cargar una lista a mano. Las
 * solicitudes de acceso pendientes aparecen arriba para aprobarlas o
 * rechazarlas, y "Restablecer acceso" ayuda a quien olvidó su PIN.
 */
export default function GuestListPanel({
  guests,
  enrollment,
  slug,
  onAdd,
  onReview,
  onReviewPlusOnes,
  onRemove,
  onRegenerate,
}: GuestListPanelProps) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; lines: string[] } | null>(null);

  const pending = guests.filter((g) => g.approvalStatus === 'pending');
  const members = guests.filter((g) => g.approvalStatus !== 'pending');
  const totalMembers = members.reduce((sum, g) => sum + 1 + g.plusOnesConfirmed, 0);
  const totalEntered = members.filter((g) => g.claimedAt).reduce((sum, g) => sum + 1 + g.plusOnesConfirmed, 0);

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
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-hotpink-500">
            Solicitudes de acceso ({pending.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((guest) => (
              <li key={guest.id} className="flex flex-wrap items-center justify-between gap-2 bg-ink-900 px-3 py-2">
                <span className="flex items-baseline gap-2">
                  <span className="font-sans text-sm text-paper-100">{guest.fullName}</span>
                  <PlusOnesBadge guest={guest} />
                </span>
                <span className="flex gap-2">
                  <button type="button" className={buttonClass} onClick={() => void run(() => onReview(guest, 'approved'))}>
                    Aprobar
                  </button>
                  <button type="button" className={buttonClass} onClick={() => void run(() => onReview(guest, 'rejected'))}>
                    Rechazar
                  </button>
                </span>
                <AnswersDetail guest={guest} enrollment={enrollment} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-2" aria-label="Alta de invitados">
        <label htmlFor="guest-names" className="font-mono text-xs uppercase tracking-wider text-paper-100/70">
          Agregar invitados a mano (opcional; un nombre y apellido por línea)
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
          className={`flex flex-col gap-1 font-mono text-xs uppercase tracking-wide ${
            feedback.kind === 'error' ? 'text-flame-500' : 'text-acid-400'
          }`}
        >
          {feedback.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}

      <section aria-label="Invitados" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-laser-500">
            Invitados: {totalMembers} · han entrado: {totalEntered}
          </h2>
          {guests.length > 0 && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => downloadCsv(`invitados-${slug}.csv`, enrollmentToCsv(guests, enrollment), { bom: true })}
            >
              Exportar CSV
            </button>
          )}
        </div>
        {members.length === 0 ? (
          <p className="font-sans text-sm text-paper-100/60">Todavía no hay invitados. Aparecerán aquí a medida que se inscriban con el enlace del evento.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {members.map((guest) => (
              <li key={guest.id} className="flex flex-wrap items-center justify-between gap-2 bg-ink-900 px-3 py-2">
                <span className="flex flex-col">
                  <span className="flex items-baseline gap-2">
                    <span className="font-sans text-sm text-paper-100">{guest.fullName}</span>
                    <PlusOnesBadge guest={guest} />
                  </span>
                  <span className="font-mono text-xs uppercase tracking-wide text-paper-100/50">
                    {guest.approvalStatus === 'rejected'
                      ? 'Rechazado'
                      : guest.checkedInAt
                        ? 'Llegó'
                        : guest.claimedAt
                          ? 'Entró'
                          : 'Aún no entra'}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {guest.plusOnesRequested > guest.plusOnesConfirmed && (
                    <>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => void run(() => onReviewPlusOnes(guest, true))}
                      >
                        Aprobar +{guest.plusOnesRequested}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => void run(() => onReviewPlusOnes(guest, false))}
                      >
                        No aprobar
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      if (window.confirm(`¿Restablecer el acceso de ${guest.fullName}? Se cierra su sesión y tendrá que inscribirse de nuevo con un PIN nuevo.`)) {
                        void run(() => onRegenerate(guest));
                      }
                    }}
                  >
                    Restablecer acceso
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
                <AnswersDetail guest={guest} enrollment={enrollment} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
