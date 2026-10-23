import { describe, expect, it } from 'vitest';
import {
  ENROLLMENT_LIMITS,
  cleanEnrollmentAnswers,
  emptyEnrollment,
  enrollmentErrorMessage,
  parseGuestAnswers,
  resolveEnrollmentConfig,
  serializeEnrollmentConfig,
  validateEnrollmentConfig,
} from './enrollmentConfig';

describe('validateEnrollmentConfig', () => {
  it('acepta la configuración vacía y una completa', () => {
    expect(validateEnrollmentConfig({})).toBe(true);
    expect(
      validateEnrollmentConfig({
        welcome: 'Bienvenida a la fiesta',
        plus_ones: { max: 2 },
        comment: { label: '¿Alguna alergia?', required: false },
        questions: [{ id: 'q1', label: '¿De qué te disfrazas?', required: true }],
      }),
    ).toBe(true);
  });

  it('rechaza lo que no es un objeto, claves ajenas y tipos equivocados', () => {
    expect(validateEnrollmentConfig(null)).toBe(false);
    expect(validateEnrollmentConfig([])).toBe(false);
    expect(validateEnrollmentConfig({ extra: 1 })).toBe(false);
    expect(validateEnrollmentConfig({ welcome: 3 })).toBe(false);
    expect(validateEnrollmentConfig({ plus_ones: { max: 2, extra: true } })).toBe(false);
  });

  it('aplica los límites de largo y de cantidad', () => {
    expect(validateEnrollmentConfig({ welcome: 'a'.repeat(ENROLLMENT_LIMITS.welcome) })).toBe(true);
    expect(validateEnrollmentConfig({ welcome: 'a'.repeat(ENROLLMENT_LIMITS.welcome + 1) })).toBe(false);
    expect(validateEnrollmentConfig({ plus_ones: { max: 0 } })).toBe(false);
    expect(validateEnrollmentConfig({ plus_ones: { max: 6 } })).toBe(false);
    expect(validateEnrollmentConfig({ plus_ones: { max: 1.5 } })).toBe(false);
    const q = (id: string) => ({ id, label: 'Pregunta', required: false });
    expect(validateEnrollmentConfig({ questions: [q('q1'), q('q2'), q('q3')] })).toBe(true);
    expect(validateEnrollmentConfig({ questions: [q('q1'), q('q2'), q('q3'), q('q4')] })).toBe(false);
    expect(validateEnrollmentConfig({ questions: [q('q1'), q('q1')] })).toBe(false);
  });

  it('cuenta caracteres Unicode (un emoji es uno), igual que la base', () => {
    expect(validateEnrollmentConfig({ welcome: '🦇'.repeat(ENROLLMENT_LIMITS.welcome) })).toBe(true);
    expect(validateEnrollmentConfig({ welcome: '🦇'.repeat(ENROLLMENT_LIMITS.welcome + 1) })).toBe(false);
  });
});

describe('resolveEnrollmentConfig / serializeEnrollmentConfig', () => {
  it('una configuración inválida o vacía no pide nada', () => {
    expect(resolveEnrollmentConfig(null)).toEqual(emptyEnrollment());
    expect(resolveEnrollmentConfig({ extra: 1 })).toEqual(emptyEnrollment());
    expect(resolveEnrollmentConfig({})).toEqual(emptyEnrollment());
  });

  it('ida y vuelta sin pérdida', () => {
    const json = {
      welcome: 'Hola',
      plus_ones: { max: 1 },
      comment: { label: 'Comentario', required: true },
      questions: [{ id: 'q1', label: 'Disfraz', required: false }],
    };
    const resolved = resolveEnrollmentConfig(json);
    expect(resolved.plusOnes).toEqual({ max: 1 });
    expect(resolved.comment).toEqual({ label: 'Comentario', required: true });
    expect(serializeEnrollmentConfig(resolved)).toEqual(json);
  });

  it('serializa a {} cuando nada está activado', () => {
    expect(serializeEnrollmentConfig(emptyEnrollment())).toEqual({});
  });

  it('descarta una bienvenida en blanco', () => {
    const r = { ...emptyEnrollment(), welcome: '   ' };
    expect(serializeEnrollmentConfig(r)).toEqual({});
  });
});

describe('cleanEnrollmentAnswers', () => {
  const config = {
    plus_ones: { max: 2 },
    comment: { label: '¿Alergias?', required: false },
    questions: [{ id: 'q1', label: '¿De qué te disfrazas?', required: true }],
  };

  it('sin configuración solo acepta respuestas vacías', () => {
    expect(cleanEnrollmentAnswers({}, null)).toEqual({ ok: true, answers: {} });
    expect(cleanEnrollmentAnswers({}, {})).toEqual({ ok: true, answers: {} });
    expect(cleanEnrollmentAnswers({}, { comment: 'hola' })).toEqual({ ok: false, error: 'comment_disabled' });
  });

  it('normaliza: recorta y descarta lo vacío', () => {
    expect(cleanEnrollmentAnswers(config, { q1: '  Regina George ', comment: '   ' })).toEqual({
      ok: true,
      answers: { q1: 'Regina George' },
    });
  });

  it('exige lo obligatorio', () => {
    expect(cleanEnrollmentAnswers(config, {})).toEqual({ ok: false, error: 'question_required:q1' });
    expect(cleanEnrollmentAnswers({ comment: { label: 'x', required: true } }, {})).toEqual({
      ok: false,
      error: 'comment_required',
    });
  });

  it('valida los +1: cantidad, nombres y que estén activados', () => {
    expect(cleanEnrollmentAnswers(config, { q1: 'x', plus_ones: ['Ana Rojas'] })).toEqual({
      ok: true,
      answers: { q1: 'x', plus_ones: ['Ana Rojas'] },
    });
    expect(cleanEnrollmentAnswers(config, { q1: 'x', plus_ones: ['A', 'B', 'C'] })).toEqual({
      ok: false,
      error: 'plus_ones_too_many',
    });
    expect(cleanEnrollmentAnswers(config, { q1: 'x', plus_ones: [' '] })).toEqual({ ok: false, error: 'plus_one_name' });
    expect(cleanEnrollmentAnswers(config, { q1: 'x', plus_ones: 'Ana' })).toEqual({ ok: false, error: 'plus_ones_invalid' });
    expect(cleanEnrollmentAnswers({}, { plus_ones: ['Ana'] })).toEqual({ ok: false, error: 'plus_ones_disabled' });
  });

  it('rechaza claves desconocidas y preguntas que no existen', () => {
    expect(cleanEnrollmentAnswers(config, { q1: 'x', otra: 'y' })).toEqual({ ok: false, error: 'unknown_key' });
    expect(cleanEnrollmentAnswers(config, { q1: 'x', q2: 'y' })).toEqual({ ok: false, error: 'question_unknown:q2' });
    expect(cleanEnrollmentAnswers(config, 'hola')).toEqual({ ok: false, error: 'answers' });
  });

  it('aplica los máximos de largo', () => {
    expect(cleanEnrollmentAnswers(config, { q1: 'x', comment: 'a'.repeat(281) })).toEqual({
      ok: false,
      error: 'comment_too_long',
    });
    expect(cleanEnrollmentAnswers(config, { q1: 'a'.repeat(ENROLLMENT_LIMITS.answer + 1) })).toEqual({
      ok: false,
      error: 'question_too_long:q1',
    });
  });
});

describe('enrollmentErrorMessage', () => {
  it('traduce cada código a un mensaje claro en español', () => {
    const config = resolveEnrollmentConfig({
      comment: { label: '¿Alergias?', required: true },
      questions: [{ id: 'q1', label: '¿De qué te disfrazas?', required: true }],
    });
    expect(enrollmentErrorMessage('comment_required', config)).toContain('¿Alergias?');
    expect(enrollmentErrorMessage('question_required:q1', config)).toContain('¿De qué te disfrazas?');
    expect(enrollmentErrorMessage('plus_one_name', config)).toMatch(/nombre/i);
    expect(enrollmentErrorMessage('algo_raro', config)).toMatch(/revisa/i);
  });
});

describe('parseGuestAnswers', () => {
  it('lee las respuestas válidas', () => {
    expect(parseGuestAnswers({ plus_ones: ['Ana Rojas'], comment: 'vegana', q1: 'Regina' })).toEqual({
      plus_ones: ['Ana Rojas'],
      comment: 'vegana',
      q1: 'Regina',
    });
  });

  it('ignora lo que no encaja y lo vacío, sin lanzar', () => {
    expect(parseGuestAnswers(null)).toEqual({});
    expect(parseGuestAnswers([])).toEqual({});
    expect(parseGuestAnswers({ plus_ones: 'Ana', comment: 5, q1: '  ', pin: '1234' })).toEqual({});
    expect(parseGuestAnswers({ plus_ones: ['Ana', 7, ' '] })).toEqual({ plus_ones: ['Ana'] });
  });
});
