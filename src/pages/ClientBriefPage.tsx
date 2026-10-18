import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBrief } from '../briefs/registry';
import type { BriefDefinition, BriefQuestion } from '../briefs/types';
import { DEFAULT_FONT, DEFAULT_PALETTE, OptionVisual, type BriefContext } from '../briefs/visuals';
import { submitClientBrief, type BriefAnswers } from '../lib/briefApi';

interface Draft {
  respondent: string;
  selected: Record<string, string[]>;
  notes: Record<string, string>;
  fields: Record<string, Record<string, string>>;
}

const emptyDraft: Draft = { respondent: '', selected: {}, notes: {}, fields: {} };

function loadDraft(slug: string): Draft {
  try {
    const raw = window.localStorage.getItem(`brief-draft:${slug}`);
    return raw ? { ...emptyDraft, ...(JSON.parse(raw) as Partial<Draft>) } : emptyDraft;
  } catch {
    return emptyDraft;
  }
}

function saveDraft(slug: string, draft: Draft) {
  try {
    window.localStorage.setItem(`brief-draft:${slug}`, JSON.stringify(draft));
  } catch {
    // Sin almacenamiento disponible la página funciona igual, sin recordar el borrador.
  }
}

/** Paleta, letras y textos ya elegidos: alimentan las vistas previas de todas las preguntas. */
function buildContext(brief: BriefDefinition, draft: Draft): BriefContext {
  const chosen = (visual: BriefQuestion['visual']) => {
    const q = brief.questions.find((item) => item.visual === visual);
    const id = q ? draft.selected[q.id]?.[0] : undefined;
    return q?.options.find((o) => o.id === id);
  };
  const fieldsQuestion = brief.questions.find((q) => q.fields);
  const texts = (fieldsQuestion && draft.fields[fieldsQuestion.id]) || {};
  return {
    palette: chosen('palette')?.palette ?? DEFAULT_PALETTE,
    font: chosen('font')?.font ?? DEFAULT_FONT,
    name: (texts.nombre ?? '').trim(),
    date: (texts.fecha ?? '').trim(),
  };
}

function buildAnswers(brief: BriefDefinition, draft: Draft): BriefAnswers {
  const answers: BriefAnswers = {};
  for (const q of brief.questions) {
    const ids = draft.selected[q.id] ?? [];
    const note = (draft.notes[q.id] ?? '').trim();
    const campos = Object.fromEntries(
      Object.entries(draft.fields[q.id] ?? {})
        .map(([key, value]) => [key, value.trim()] as const)
        .filter(([, value]) => value),
    );
    const hasCampos = Object.keys(campos).length > 0;
    if (ids.length === 0 && !note && !hasCampos) continue;
    answers[q.id] = {
      pregunta: q.title,
      elegidas: q.options.filter((o) => ids.includes(o.id)).map((o) => o.label),
      nota: note,
      ...(hasCampos ? { campos } : {}),
    };
  }
  return answers;
}

function answersAsText(brief: BriefDefinition, respondent: string, answers: BriefAnswers): string {
  const lines = [`${brief.title}${respondent ? ` — ${respondent}` : ''}`, ''];
  for (const a of Object.values(answers)) {
    lines.push(a.pregunta);
    if (a.elegidas.length) lines.push(`  Elegí: ${a.elegidas.join(', ')}`);
    if (a.campos) {
      for (const [key, value] of Object.entries(a.campos)) lines.push(`  ${key}: ${value}`);
    }
    if (a.nota) lines.push(`  Nota: ${a.nota}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

/**
 * ClientBriefPage — formulario de opciones para el cliente de un cumpleaños
 * (/brief/:slug). El motor es genérico; las preguntas salen de
 * src/briefs/<slug>.ts. Cada pregunta mezcla opciones (con vista previa) y nota
 * libre, y lo elegido antes (paleta, letras, textos) se aplica en las vistas
 * siguientes. Si el envío falla, se puede copiar la respuesta para mandarla.
 */
export default function ClientBriefPage() {
  const { slug } = useParams<{ slug: string }>();
  const brief = useMemo(() => getBrief(slug), [slug]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (brief) setDraft(loadDraft(brief.slug));
  }, [brief]);

  if (!brief) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-950 px-4 text-paper-100">
        <p className="font-mono text-xs uppercase tracking-widest text-paper-100/70">
          Este formulario no existe.
        </p>
      </main>
    );
  }

  function update(next: Draft) {
    setDraft(next);
    if (brief) saveDraft(brief.slug, next);
  }

  function toggle(q: BriefQuestion, optionId: string) {
    const option = q.options.find((o) => o.id === optionId);
    const current = draft.selected[q.id] ?? [];
    let next: string[];
    if (current.includes(optionId)) {
      next = current.filter((id) => id !== optionId);
    } else if (q.selection === 'single' || option?.exclusive) {
      next = [optionId];
    } else {
      // Una opción normal suelta las exclusivas (p. ej. "lo conversamos en privado").
      const kept = current.filter((id) => !q.options.find((o) => o.id === id)?.exclusive);
      next = [...kept, optionId];
      if (q.max && next.length > q.max) next = next.slice(next.length - q.max);
    }
    update({ ...draft, selected: { ...draft.selected, [q.id]: next } });
  }

  const ctx = buildContext(brief, draft);
  const answers = buildAnswers(brief, draft);
  const answered = Object.keys(answers).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brief) return;
    setError(null);
    setStatus('sending');
    try {
      await submitClientBrief(brief.slug, draft.respondent, answers);
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'No pudimos enviar tus respuestas.');
    }
  }

  async function handleCopy() {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(answersAsText(brief, draft.respondent, answers));
      setCopied(true);
    } catch {
      setError('No pudimos copiar. Selecciona el texto a mano o saca una captura.');
    }
  }

  if (status === 'sent') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-950 px-4 text-paper-100">
        <div className="flex max-w-sm flex-col gap-3 border border-smoke-700/40 bg-ink-900 p-6">
          <h1 className="font-display text-2xl uppercase tracking-wide">Listo, recibido</h1>
          <p className="font-sans text-sm text-paper-100/80">
            Gracias. Con tus respuestas armamos las primeras propuestas. Si quieres cambiar algo, vuelve a
            entrar a este enlace y envía de nuevo.
          </p>
        </div>
      </main>
    );
  }

  const labelClass = 'font-mono text-[11px] uppercase tracking-wider text-paper-100/70';
  const fieldClass =
    'border border-smoke-700/60 bg-ink-900 px-3 py-2 font-sans text-sm text-paper-100 outline-none placeholder:text-paper-100/40 focus-visible:border-paper-100 focus-visible:ring-1 focus-visible:ring-paper-100';

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-paper-100">
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-widest text-paper-100/70">
            Formulario de estilo
          </span>
          <h1 className="font-display text-4xl uppercase tracking-wide">{brief.title}</h1>
          <p className="max-w-prose font-sans text-sm text-paper-100/80">{brief.intro}</p>
        </header>

        <div className="flex flex-col gap-1">
          <label htmlFor="brief-respondent" className={labelClass}>
            Tu nombre
          </label>
          <input
            id="brief-respondent"
            maxLength={80}
            autoComplete="given-name"
            value={draft.respondent}
            onChange={(e) => update({ ...draft, respondent: e.target.value })}
            className={fieldClass}
          />
        </div>

        {brief.questions.map((q, index) => {
          const chosen = draft.selected[q.id] ?? [];
          const noteId = `brief-note-${q.id}`;
          return (
            <fieldset key={q.id} className="flex flex-col gap-3 border-0 p-0">
              <legend className="mb-1 flex flex-col gap-1">
                <span className={labelClass}>
                  {String(index + 1).padStart(2, '0')} / {String(brief.questions.length).padStart(2, '0')}
                </span>
                <span className="font-display text-xl uppercase tracking-wide">{q.title}</span>
                {q.help && <span className="font-sans text-sm text-paper-100/70">{q.help}</span>}
              </legend>

              {q.fields && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {q.fields.map((f) => {
                    const fieldId = `brief-field-${q.id}-${f.id}`;
                    return (
                      <div key={f.id} className="flex flex-col gap-1">
                        <label htmlFor={fieldId} className={labelClass}>
                          {f.label}
                        </label>
                        <input
                          id={fieldId}
                          maxLength={60}
                          placeholder={f.placeholder}
                          value={draft.fields[q.id]?.[f.id] ?? ''}
                          onChange={(e) =>
                            update({
                              ...draft,
                              fields: { ...draft.fields, [q.id]: { ...draft.fields[q.id], [f.id]: e.target.value } },
                            })
                          }
                          className={fieldClass}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {q.options.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {q.options.map((o) => {
                    const on = chosen.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(q, o.id)}
                        className={`relative flex min-h-[44px] flex-col items-start gap-2 border-2 p-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-paper-100 ${
                          on ? 'border-paper-100 bg-ink-900' : 'border-smoke-700/50 bg-ink-900/60'
                        }`}
                      >
                        {on && (
                          <span
                            className="absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center bg-paper-100 font-mono text-xs font-bold text-ink-950"
                            aria-hidden
                          >
                            ✓
                          </span>
                        )}
                        <OptionVisual question={q} option={o} ctx={ctx} />
                        <span className="font-sans text-sm font-semibold">{o.label}</span>
                        {o.hint && <span className="font-sans text-xs text-paper-100/70">{o.hint}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <label htmlFor={noteId} className={labelClass}>
                {q.options.length > 0 || q.fields ? 'Algo más (opcional)' : 'Tu respuesta'}
              </label>
              <textarea
                id={noteId}
                rows={q.options.length > 0 || q.fields ? 2 : 3}
                maxLength={1000}
                placeholder={q.notePlaceholder}
                value={draft.notes[q.id] ?? ''}
                onChange={(e) => update({ ...draft, notes: { ...draft.notes, [q.id]: e.target.value } })}
                className={fieldClass}
              />
            </fieldset>
          );
        })}

        {error && (
          <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="submit"
            disabled={status === 'sending' || answered === 0}
            className="h-11 bg-paper-100 font-display text-sm uppercase tracking-wider text-ink-950 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'sending' ? 'Enviando...' : 'Enviar mis respuestas'}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={answered === 0}
            className="h-9 border border-smoke-700/60 font-mono text-[11px] uppercase tracking-wider text-paper-100 disabled:opacity-60"
          >
            {copied ? 'Copiado' : 'Copiar mis respuestas'}
          </button>
          <p className="font-mono text-[10px] tracking-wide text-paper-100/50">
            {answered} de {brief.questions.length} preguntas respondidas. Tu avance se guarda en este
            navegador.
          </p>
        </div>
      </form>
    </main>
  );
}
