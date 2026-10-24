import { useState } from 'react';
import type { EventSettingsPatch, OrganizerEvent } from '../lib/organizerApi';
import {
  ENROLLMENT_LIMITS,
  QUESTION_IDS,
  asksForPersonalData,
  emptyEnrollment,
  type QuestionId,
  type ResolvedEnrollment,
} from '../lib/enrollmentConfig';

interface EnrollmentSettingsProps {
  event: OrganizerEvent;
  onSave: (patch: EventSettingsPatch) => Promise<void>;
  /**
   * Ids de preguntas con respuestas ya guardadas por algún invitado. Una pregunta nueva no los reutiliza:
   * si se quitó `q2` y se agrega otra, las respuestas viejas de `q2` aparecerían como respuesta a la nueva.
   */
  usedQuestionIds?: readonly QuestionId[];
}

interface QuestionDraft {
  id: QuestionId;
  label: string;
  required: boolean;
}

const DEFAULT_COMMENT_LABEL = 'Comentario';

const fieldClass =
  'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none focus-visible:ring-2 focus-visible:ring-acid-400';
const labelClass = 'font-mono text-xs uppercase tracking-wider text-paper-100/70';
const checkClass = 'flex min-h-11 items-center gap-2 font-sans text-sm text-paper-100';
const smallButton =
  'h-9 border border-smoke-700/60 px-3 font-mono text-xs uppercase tracking-wider text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-400 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Pestaña «Inscripción»: qué le pide el organizador al invitado cuando se
 * inscribe con el enlace. Todo es opcional; con todo apagado la inscripción
 * pide solo nombre, apellido y PIN. Las reglas y los límites viven en
 * `enrollmentConfig.ts` (y la base las replica).
 */
export default function EnrollmentSettings({ event, onSave, usedQuestionIds = [] }: EnrollmentSettingsProps) {
  const current = event.enrollment;
  const [welcome, setWelcome] = useState(current.welcome);
  const [plusOnesOn, setPlusOnesOn] = useState(current.plusOnes !== null);
  const [plusOnesMax, setPlusOnesMax] = useState(current.plusOnes?.max ?? 1);
  const [commentOn, setCommentOn] = useState(current.comment !== null);
  const [commentLabel, setCommentLabel] = useState(current.comment?.label ?? DEFAULT_COMMENT_LABEL);
  const [commentRequired, setCommentRequired] = useState(current.comment?.required ?? false);
  const [questions, setQuestions] = useState<QuestionDraft[]>(current.questions.map((q) => ({ ...q })));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const freeId = QUESTION_IDS.find((id) => !questions.some((q) => q.id === id) && !usedQuestionIds.includes(id));
  // Hay lugar para otra pregunta, pero todos los ids libres ya tienen respuestas de invitados.
  const blockedByAnswers = !freeId && questions.length < ENROLLMENT_LIMITS.questions;

  function addQuestion() {
    if (!freeId) return;
    setQuestions((prev) => [...prev, { id: freeId, label: '', required: false }]);
    setMessage(null);
  }

  function updateQuestion(id: QuestionId, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (commentOn && !commentLabel.trim()) {
      setMessage({ kind: 'error', text: 'Escribe la pregunta del comentario.' });
      return;
    }
    const blank = questions.findIndex((q) => !q.label.trim());
    if (blank >= 0) {
      setMessage({ kind: 'error', text: `Escribe el texto de la pregunta ${blank + 1}.` });
      return;
    }
    const personalData = [
      ...(commentOn ? [{ name: 'del comentario', label: commentLabel }] : []),
      ...questions.map((q, i) => ({ name: `${i + 1}`, label: q.label })),
    ].find((item) => asksForPersonalData(item.label));
    if (personalData) {
      setMessage({
        kind: 'error',
        text: `La pregunta ${personalData.name} pide un dato personal. No se pueden pedir RUT, correo, teléfono ni claves: esta plataforma no los guarda.`,
      });
      return;
    }

    const enrollment: ResolvedEnrollment = {
      ...emptyEnrollment(),
      welcome: welcome.trim(),
      plusOnes: plusOnesOn ? { max: plusOnesMax } : null,
      comment: commentOn ? { label: commentLabel.trim(), required: commentRequired } : null,
      questions: questions.map((q) => ({ id: q.id, label: q.label.trim(), required: q.required })),
    };

    setSaving(true);
    try {
      await onSave({ enrollment });
      setMessage({ kind: 'ok', text: 'Inscripción guardada.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No pudimos guardar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex max-w-md flex-col gap-6"
      aria-label="Qué se pide al inscribirse"
    >
      <p className="font-sans text-sm text-paper-100/80">
        Elige qué más le preguntas a cada invitado cuando se inscribe con tu enlace. Siempre se pide nombre, apellido y un
        PIN. No se pueden pedir RUT, correo ni teléfono.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="enr-welcome" className={labelClass}>
          Texto de bienvenida <span className="text-paper-100/50">opcional</span>
        </label>
        <textarea
          id="enr-welcome"
          rows={3}
          maxLength={ENROLLMENT_LIMITS.welcome}
          value={welcome}
          onChange={(e) => setWelcome(e.target.value)}
          className={`${fieldClass} resize-none`}
        />
        <p className="font-mono text-xs tracking-wide text-paper-100/50">
          Se muestra arriba del formulario. {[...welcome].length}/{ENROLLMENT_LIMITS.welcome}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className={`${labelClass} mb-2`}>Acompañantes</legend>
        <label className={checkClass}>
          <input type="checkbox" checked={plusOnesOn} onChange={(e) => setPlusOnesOn(e.target.checked)} />
          Permitir acompañantes (+1)
        </label>
        {plusOnesOn && (
          <div className="flex flex-col gap-1">
            <label htmlFor="enr-plus-max" className={labelClass}>
              Máximo de acompañantes
            </label>
            <select
              id="enr-plus-max"
              value={plusOnesMax}
              onChange={(e) => setPlusOnesMax(Number(e.target.value))}
              className={fieldClass}
            >
              {Array.from({ length: ENROLLMENT_LIMITS.plusOnesMax }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="font-sans text-xs text-paper-100/60">
              Cada invitado indica cuántos trae y escribe sus nombres. Es una solicitud: tú la apruebas desde Invitados, y
              solo los aprobados se cuentan en el aforo.
            </p>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className={`${labelClass} mb-2`}>Comentario</legend>
        <label className={checkClass}>
          <input type="checkbox" checked={commentOn} onChange={(e) => setCommentOn(e.target.checked)} />
          Pedir un comentario
        </label>
        {commentOn && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="enr-comment-label" className={labelClass}>
                Pregunta del comentario
              </label>
              <input
                id="enr-comment-label"
                maxLength={ENROLLMENT_LIMITS.commentLabel}
                value={commentLabel}
                onChange={(e) => setCommentLabel(e.target.value)}
                className={fieldClass}
              />
              <p className="font-sans text-xs text-paper-100/60">
                El invitado responde con hasta {ENROLLMENT_LIMITS.comment} caracteres. Por ejemplo: «¿Alguna alergia o
                restricción?».
              </p>
            </div>
            <label className={checkClass}>
              <input
                type="checkbox"
                checked={commentRequired}
                onChange={(e) => setCommentRequired(e.target.checked)}
              />
              El comentario es obligatorio
            </label>
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className={`${labelClass} mb-2`}>Preguntas propias</legend>
        <p className="font-sans text-xs text-paper-100/60">
          Hasta {ENROLLMENT_LIMITS.questions} preguntas de respuesta corta. Por ejemplo: «¿De qué te disfrazas?».
        </p>
        {questions.map((q, i) => (
          <div key={q.id} className="flex flex-col gap-2 border border-smoke-700/40 p-3">
            <label htmlFor={`enr-q-${q.id}`} className={labelClass}>
              {`Pregunta ${i + 1}`}
            </label>
            <input
              id={`enr-q-${q.id}`}
              maxLength={ENROLLMENT_LIMITS.questionLabel}
              value={q.label}
              onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
              className={fieldClass}
            />
            <div className="flex items-center justify-between gap-2">
              <label className={checkClass}>
                <input
                  type="checkbox"
                  checked={q.required}
                  aria-label={`Pregunta ${i + 1} obligatoria`}
                  onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                />
                Obligatoria
              </label>
              <button
                type="button"
                className={smallButton}
                aria-label={`Quitar pregunta ${i + 1}`}
                onClick={() => setQuestions((prev) => prev.filter((x) => x.id !== q.id))}
              >
                Quitar
              </button>
            </div>
          </div>
        ))}
        <button type="button" className={`${smallButton} self-start`} onClick={addQuestion} disabled={!freeId}>
          Agregar pregunta
        </button>
        {blockedByAnswers && (
          <p className="font-sans text-xs text-paper-100/60">
            Los invitados ya respondieron las preguntas que quitaste: para no mezclar esas respuestas con una pregunta
            nueva, no se pueden volver a usar.
          </p>
        )}
      </fieldset>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`font-mono text-xs uppercase tracking-wide ${
            message.kind === 'error' ? 'text-flame-500' : 'text-acid-400'
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="h-11 bg-acid-400 font-display text-sm uppercase tracking-wider text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-100 disabled:opacity-60"
      >
        {saving ? 'Guardando...' : 'Guardar inscripción'}
      </button>
    </form>
  );
}
