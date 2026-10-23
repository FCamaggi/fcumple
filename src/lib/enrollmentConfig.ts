/**
 * Inscripción configurable (Fase 1): qué le pide el organizador al invitado
 * cuando se inscribe en `/e/:slug`. La regla de validación VIVE aquí y la
 * migración `enrollment_config` la replica en SQL; un test de la suite de base
 * de datos compara ambas con la misma tabla de casos.
 *
 * Forma guardada en `events.enrollment_config` (la presencia de una clave la
 * activa; `{}` no pide nada):
 *   { welcome?, plus_ones?: { max }, comment?: { label, required },
 *     questions?: [{ id: 'q1'|'q2'|'q3', label, required }] }
 *
 * Respuestas guardadas en `guests.guest_answers`:
 *   { plus_ones?: string[], comment?: string, q1?: string, q2?: string, q3?: string }
 *
 * Nada de esto pide RUT, correo, teléfono ni PIN: son preguntas de la fiesta.
 */

export const ENROLLMENT_LIMITS = {
  welcome: 400,
  commentLabel: 120,
  questionLabel: 80,
  /** Comentario libre del invitado. */
  comment: 280,
  /** Respuesta a una pregunta propia (texto corto). */
  answer: 140,
  plusOneName: 80,
  plusOnesMax: 5,
  questions: 3,
} as const;

export const QUESTION_IDS = ['q1', 'q2', 'q3'] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export interface EnrollmentConfigJson {
  welcome?: string;
  plus_ones?: { max: number };
  comment?: { label: string; required: boolean };
  questions?: Array<{ id: QuestionId; label: string; required: boolean }>;
}

export interface ResolvedEnrollment {
  welcome: string;
  plusOnes: { max: number } | null;
  comment: { label: string; required: boolean } | null;
  questions: Array<{ id: QuestionId; label: string; required: boolean }>;
}

type Json = Record<string, unknown>;

const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Largo en caracteres Unicode (un emoji cuenta uno), igual que `char_length` en Postgres. */
const length = (s: string) => [...s].length;

/** Texto con largo entre 1 y `max` después de recortar. */
const text = (x: unknown, max: number): x is string =>
  typeof x === 'string' && length(x.trim()) >= 1 && length(x.trim()) <= max;

const hasOnly = (o: Json, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));

export function validateEnrollmentConfig(config: unknown): boolean {
  if (!isObject(config) || !hasOnly(config, ['welcome', 'plus_ones', 'comment', 'questions'])) return false;

  if ('welcome' in config && !text(config.welcome, ENROLLMENT_LIMITS.welcome)) return false;

  if ('plus_ones' in config) {
    const p = config.plus_ones;
    if (!isObject(p) || !hasOnly(p, ['max'])) return false;
    if (typeof p.max !== 'number' || !Number.isInteger(p.max) || p.max < 1 || p.max > ENROLLMENT_LIMITS.plusOnesMax) {
      return false;
    }
  }

  if ('comment' in config) {
    const c = config.comment;
    if (!isObject(c) || !hasOnly(c, ['label', 'required'])) return false;
    if (!text(c.label, ENROLLMENT_LIMITS.commentLabel) || typeof c.required !== 'boolean') return false;
  }

  if ('questions' in config) {
    const qs = config.questions;
    if (!Array.isArray(qs) || qs.length > ENROLLMENT_LIMITS.questions) return false;
    const seen = new Set<string>();
    for (const q of qs) {
      if (!isObject(q) || !hasOnly(q, ['id', 'label', 'required'])) return false;
      if (typeof q.id !== 'string' || !(QUESTION_IDS as readonly string[]).includes(q.id) || seen.has(q.id)) return false;
      if (!text(q.label, ENROLLMENT_LIMITS.questionLabel) || typeof q.required !== 'boolean') return false;
      seen.add(q.id);
    }
  }

  return true;
}

export const emptyEnrollment = (): ResolvedEnrollment => ({ welcome: '', plusOnes: null, comment: null, questions: [] });

/** Lee lo que vino de la base. Una configuración inválida se trata como "no pide nada". */
export function resolveEnrollmentConfig(raw: unknown): ResolvedEnrollment {
  if (!validateEnrollmentConfig(raw)) return emptyEnrollment();
  const c = raw as EnrollmentConfigJson;
  return {
    welcome: c.welcome?.trim() ?? '',
    plusOnes: c.plus_ones ? { max: c.plus_ones.max } : null,
    comment: c.comment ? { label: c.comment.label.trim(), required: c.comment.required } : null,
    questions: (c.questions ?? []).map((q) => ({ id: q.id, label: q.label.trim(), required: q.required })),
  };
}

/** Lo que se guarda en `events.enrollment_config`: solo lo activado, con los textos recortados. */
export function serializeEnrollmentConfig(r: ResolvedEnrollment): EnrollmentConfigJson {
  const out: EnrollmentConfigJson = {};
  const welcome = r.welcome.trim();
  if (welcome) out.welcome = welcome;
  if (r.plusOnes) out.plus_ones = { max: r.plusOnes.max };
  if (r.comment) out.comment = { label: r.comment.label.trim(), required: r.comment.required };
  if (r.questions.length > 0) {
    out.questions = r.questions.map((q) => ({ id: q.id, label: q.label.trim(), required: q.required }));
  }
  return out;
}

export type CleanAnswersResult = { ok: true; answers: Json } | { ok: false; error: string };

const fail = (error: string): CleanAnswersResult => ({ ok: false, error });
const present = (x: unknown) => x !== undefined && x !== null;

/**
 * Valida y normaliza las respuestas contra la configuración del evento. Hace lo
 * mismo que `_clean_enrollment_answers` en la base (el orden de las
 * comprobaciones también), así el formulario avisa antes de enviar y la base
 * es la que manda. Los textos vacíos se tratan como "sin respuesta".
 */
export function cleanEnrollmentAnswers(rawConfig: unknown, rawAnswers: unknown): CleanAnswersResult {
  const config = (validateEnrollmentConfig(rawConfig) ? rawConfig : {}) as EnrollmentConfigJson;
  const answers = rawAnswers ?? {};
  if (!isObject(answers)) return fail('answers');
  if (!hasOnly(answers, ['plus_ones', 'comment', ...QUESTION_IDS])) return fail('unknown_key');

  const out: Json = {};

  // +1: lista de nombres.
  if (present(answers.plus_ones)) {
    const names = answers.plus_ones;
    if (!Array.isArray(names)) return fail('plus_ones_invalid');
    if (names.length > 0) {
      if (!config.plus_ones) return fail('plus_ones_disabled');
      if (names.length > config.plus_ones.max) return fail('plus_ones_too_many');
      const clean: string[] = [];
      for (const n of names) {
        if (!text(n, ENROLLMENT_LIMITS.plusOneName)) return fail('plus_one_name');
        clean.push(n.trim());
      }
      out.plus_ones = clean;
    }
  }

  // Comentario.
  if (present(answers.comment)) {
    if (typeof answers.comment !== 'string') return fail('comment_invalid');
    const value = answers.comment.trim();
    if (value) {
      if (!config.comment) return fail('comment_disabled');
      if (length(value) > ENROLLMENT_LIMITS.comment) return fail('comment_too_long');
      out.comment = value;
    }
  }
  if (config.comment?.required && out.comment === undefined) return fail('comment_required');

  // Preguntas propias, en el orden de la configuración.
  const configured = new Set<string>();
  for (const q of config.questions ?? []) {
    configured.add(q.id);
    const raw = answers[q.id];
    if (present(raw)) {
      if (typeof raw !== 'string') return fail(`question_invalid:${q.id}`);
      const value = raw.trim();
      if (value) {
        if (length(value) > ENROLLMENT_LIMITS.answer) return fail(`question_too_long:${q.id}`);
        out[q.id] = value;
      }
    }
    if (q.required && out[q.id] === undefined) return fail(`question_required:${q.id}`);
  }
  // Respuesta a una pregunta que no existe (o ya no existe) en este evento.
  for (const id of QUESTION_IDS) {
    const raw = answers[id];
    if (configured.has(id) || !present(raw)) continue;
    if (typeof raw === 'string' && !raw.trim()) continue;
    return fail(`question_unknown:${id}`);
  }

  return { ok: true, answers: out };
}

/** Mensaje en español para un código de `cleanEnrollmentAnswers` o de la base (`enrollment_invalid:…`). */
export function enrollmentErrorMessage(code: string, config: ResolvedEnrollment): string {
  const [kind, field] = code.split(':');
  const question = config.questions.find((q) => q.id === field);
  switch (kind) {
    case 'comment_required':
      return `Responde: ${config.comment?.label ?? 'el comentario'}.`;
    case 'comment_too_long':
      return `El comentario puede tener hasta ${ENROLLMENT_LIMITS.comment} caracteres.`;
    case 'question_required':
      return `Responde: ${question?.label ?? 'la pregunta'}.`;
    case 'question_too_long':
      return `La respuesta a «${question?.label ?? 'la pregunta'}» puede tener hasta ${ENROLLMENT_LIMITS.answer} caracteres.`;
    case 'plus_one_name':
      return 'Escribe el nombre de cada acompañante.';
    case 'plus_ones_too_many':
      return `Puedes traer hasta ${config.plusOnes?.max ?? 0} acompañante${config.plusOnes?.max === 1 ? '' : 's'}.`;
    default:
      return 'Revisa tus respuestas e intenta de nuevo.';
  }
}
