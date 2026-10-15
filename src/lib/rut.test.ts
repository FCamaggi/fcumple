import { describe, expect, it } from 'vitest';
import { computeCheckDigit, formatRutInput, isValidRut, normalizeRut } from './rut';

describe('computeCheckDigit', () => {
  it.each([
    ['11111111', '1'],
    ['12345678', '5'],
    ['76086428', '5'],
    ['10000013', 'K'],
    ['10000004', '0'],
  ])('%s -> %s', (body, dv) => {
    expect(computeCheckDigit(body)).toBe(dv);
  });
});

describe('normalizeRut', () => {
  it('quita puntos, espacios y guion, y pone la K en mayúscula', () => {
    expect(normalizeRut(' 12.345.678-5 ')).toBe('12345678-5');
    expect(normalizeRut('10000013k')).toBe('10000013-K');
  });

  it.each(['', 'abc', '123', '1234567890', '12.345.678-X'])('rechaza %j', (value) => {
    expect(normalizeRut(value)).toBeNull();
  });
});

describe('isValidRut', () => {
  it('acepta RUT con el dígito correcto, con o sin formato', () => {
    expect(isValidRut('12.345.678-5')).toBe(true);
    expect(isValidRut('123456785')).toBe(true);
    expect(isValidRut('10.000.013-k')).toBe(true);
  });

  it('rechaza un dígito verificador equivocado o un formato imposible', () => {
    expect(isValidRut('12.345.678-9')).toBe(false);
    expect(isValidRut('hola')).toBe(false);
  });
});

describe('formatRutInput', () => {
  it('da formato progresivo mientras se escribe', () => {
    expect(formatRutInput('1')).toBe('1');
    expect(formatRutInput('12')).toBe('1-2');
    expect(formatRutInput('123456785')).toBe('12.345.678-5');
    expect(formatRutInput('12345678k')).toBe('12.345.678-K');
  });

  it('ignora caracteres ajenos y corta en 9', () => {
    expect(formatRutInput('12a.345?678-5999')).toBe('12.345.678-5');
  });
});
