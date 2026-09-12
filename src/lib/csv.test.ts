import { describe, expect, it } from 'vitest';
import { guestsToCsv, csvTemplate, parseGuestsCsv } from './csv';
import type { Guest } from '../types';

const guests: Guest[] = [
  {
    id: 'g1',
    fullName: 'Maria Fernanda Contreras',
    status: 'confirmed',
    plusOnesAllowed: 2,
    plusOnesConfirmed: 1,
    guestNote: 'sin nueces, sin lácteos',
    respondedAt: null,
    checkedInAt: null,
  },
  {
    id: 'g2',
    fullName: 'José "Pepe" Díaz',
    status: 'pending',
    plusOnesAllowed: 0,
    plusOnesConfirmed: 0,
    guestNote: null,
    respondedAt: null,
    checkedInAt: null,
  },
];

describe('guestsToCsv', () => {
  it('serializes guests with the expected header', () => {
    const csv = guestsToCsv(guests);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('full_name,status,plus_ones_allowed,plus_ones_confirmed,guest_note');
  });

  it('escapes commas, quotes and newlines in fields', () => {
    const withCommas: Guest[] = [
      {
        id: 'g3',
        fullName: 'Ana, la del piso 3',
        status: 'declined',
        plusOnesAllowed: 1,
        plusOnesConfirmed: 0,
        guestNote: 'trae "algo especial", llega tarde\ny se va temprano',
        respondedAt: null,
        checkedInAt: null,
      },
    ];
    const csv = guestsToCsv(withCommas);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(
      '"Ana, la del piso 3",declined,1,0,"trae ""algo especial"", llega tarde\ny se va temprano"'
    );
  });

  it('round-trips full_name and guest_note with a naive split-by-comma being unsafe', () => {
    const csv = guestsToCsv(guests);
    // naive split would produce more than 5 fields for the José row's quoted name if unescaped;
    // here quoting means "José ""Pepe"" Díaz" stays a single field
    const lines = csv.split('\r\n');
    expect(lines[2]).toBe('"José ""Pepe"" Díaz",pending,0,0,');
  });
});

describe('csvTemplate', () => {
  it('has the header expected for import', () => {
    const csv = csvTemplate();
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('full_name,plus_ones_allowed');
  });

  it('includes an example row', () => {
    const csv = csvTemplate();
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('parseGuestsCsv', () => {
  it('parses valid rows regardless of column order', () => {
    const text = 'plus_ones_allowed,full_name\n2,Ana Torres\n0,Beto Soto\n';
    const result = parseGuestsCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { fullName: 'Ana Torres', plusOnesAllowed: 2 },
      { fullName: 'Beto Soto', plusOnesAllowed: 0 },
    ]);
  });

  it('tolerates surrounding whitespace in header and values', () => {
    const text = ' full_name , plus_ones_allowed \n Ana Torres , 2 \n';
    const result = parseGuestsCsv(text);
    expect(result.valid).toEqual([{ fullName: 'Ana Torres', plusOnesAllowed: 2 }]);
  });

  it('separates invalid rows into errors without discarding valid ones', () => {
    const text = [
      'full_name,plus_ones_allowed',
      'Ana Torres,2',
      ',3',
      'Beto Soto,not-a-number',
      'Carla Ruiz,-1',
      'Dana Vera,1',
    ].join('\n');
    const result = parseGuestsCsv(text);
    expect(result.valid).toEqual([
      { fullName: 'Ana Torres', plusOnesAllowed: 2 },
      { fullName: 'Dana Vera', plusOnesAllowed: 1 },
    ]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toMatchObject({ row: 3 });
    expect(result.errors[1]).toMatchObject({ row: 4 });
    expect(result.errors[2]).toMatchObject({ row: 5 });
    expect(result.errors[0].message).toMatch(/nombre/i);
    expect(result.errors[1].message).toMatch(/numér|number/i);
    expect(result.errors[2].message).toMatch(/negativ/i);
  });

  it('handles quoted fields with embedded commas', () => {
    const text = 'full_name,plus_ones_allowed\n"Ana, la de siempre",1\n';
    const result = parseGuestsCsv(text);
    expect(result.valid).toEqual([{ fullName: 'Ana, la de siempre', plusOnesAllowed: 1 }]);
  });
});
