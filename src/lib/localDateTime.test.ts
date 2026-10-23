import { describe, expect, it } from 'vitest';
import { isoToLocalInput, localInputToIso } from './localDateTime';

describe('localDateTime', () => {
  it('ida y vuelta: lo que se escribe en el campo es lo que se guarda', () => {
    const iso = localInputToIso('2026-10-30T20:30');
    expect(iso).not.toBeNull();
    expect(isoToLocalInput(iso)).toBe('2026-10-30T20:30');
  });

  it('el instante guardado es un ISO válido', () => {
    expect(localInputToIso('2026-10-30T20:30')).toMatch(/^2026-10-3[01]T\d{2}:30:00\.000Z$/);
  });

  it('un campo vacío o inválido es "sin fecha"', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('no es fecha')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('no es fecha')).toBe('');
  });

  it('rellena con ceros las horas y los minutos de un dígito', () => {
    expect(isoToLocalInput(localInputToIso('2026-01-05T07:05'))).toBe('2026-01-05T07:05');
  });
});
