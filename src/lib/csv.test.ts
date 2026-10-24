import { describe, expect, it } from 'vitest';
import { guestsToCsv, csvTemplate, enrollmentToCsv, parseGuestsCsv } from './csv';
import type { OrganizerGuest } from './organizerApi';
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
    phone: '987654321',
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
  it('serializes guests with the expected header, including phone', () => {
    const csv = guestsToCsv(guests);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('token,full_name,status,plus_ones_allowed,plus_ones_confirmed,guest_note,phone');
  });

  it('leaves phone blank when the guest has none', () => {
    const csv = guestsToCsv(guests);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(
      ',Maria Fernanda Contreras,confirmed,2,1,"sin nueces, sin lácteos",987654321',
    );
    expect(lines[2]).toBe(',"José ""Pepe"" Díaz",pending,0,0,,');
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
      ',"Ana, la del piso 3",declined,1,0,"trae ""algo especial"", llega tarde\ny se va temprano",'
    );
  });

  it('round-trips full_name and guest_note with a naive split-by-comma being unsafe', () => {
    const csv = guestsToCsv(guests);
    // naive split would produce more than 5 fields for the José row's quoted name if unescaped;
    // here quoting means "José ""Pepe"" Díaz" stays a single field
    const lines = csv.split('\r\n');
    expect(lines[2]).toBe(',"José ""Pepe"" Díaz",pending,0,0,,');
  });
});

describe('csvTemplate', () => {
  it('has the header expected for import, including the optional phone column', () => {
    const csv = csvTemplate();
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('token,full_name,status,plus_ones_allowed,plus_ones_confirmed,guest_note,phone');
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

  it('keeps working exactly as before when the optional phone column is absent', () => {
    const text = 'full_name,plus_ones_allowed\nAna Torres,2\n';
    const result = parseGuestsCsv(text);
    expect(result.valid).toEqual([{ fullName: 'Ana Torres', plusOnesAllowed: 2 }]);
    expect(result.valid[0]).not.toHaveProperty('phone');
  });

  it('picks up an optional phone column when present', () => {
    const text = 'full_name,plus_ones_allowed,phone\nAna Torres,2,+56 9 1234 5678\nBeto Soto,0,\n';
    const result = parseGuestsCsv(text);
    expect(result.valid).toEqual([
      { fullName: 'Ana Torres', plusOnesAllowed: 2, phone: '+56 9 1234 5678' },
      { fullName: 'Beto Soto', plusOnesAllowed: 0 },
    ]);
    expect(result.valid[1]).not.toHaveProperty('phone');
  });
});

describe('enrollmentToCsv', () => {
  const guest = (over: Partial<OrganizerGuest> = {}): OrganizerGuest => ({
    id: 'g1',
    eventId: 'ev-1',
    fullName: 'Ana Rojas',
    token: 'TOKEN-SECRETO',
    approvalStatus: 'approved',
    status: 'pending',
    plusOnesAllowed: 0,
    plusOnesConfirmed: 0,
    photoQuota: 10,
    answers: {},
    plusOnesRequested: 0,
    checkedInAt: null,
    claimedAt: '2026-10-30T00:00:00Z',
    lastSeenAt: null,
    cameraActivatedAt: null,
    ...over,
  });
  const config = {
    welcome: '',
    plusOnes: { max: 2 },
    comment: { label: '¿Alguna alergia?', required: false },
    questions: [{ id: 'q1' as const, label: '¿De qué te disfrazas?', required: true }],
  };

  it('arma una columna por cada pregunta configurada, con sus etiquetas', () => {
    const [header] = enrollmentToCsv([], config).split('\r\n');
    expect(header).toBe(
      'Nombre,Estado,Entró,Llegó,Acompañantes solicitados,Acompañantes aprobados,Nombres de acompañantes,¿Alguna alergia?,¿De qué te disfrazas?',
    );
  });

  it('sin preguntas configuradas solo lleva las columnas básicas', () => {
    const empty = { welcome: '', plusOnes: null, comment: null, questions: [] };
    expect(enrollmentToCsv([], empty)).toBe(
      'Nombre,Estado,Entró,Llegó,Acompañantes solicitados,Acompañantes aprobados,Nombres de acompañantes',
    );
  });

  it('escribe las respuestas y los acompañantes de cada invitado', () => {
    const csv = enrollmentToCsv(
      [
        guest({
          plusOnesRequested: 2,
          plusOnesConfirmed: 1,
          checkedInAt: '2026-10-30T23:40:00Z',
          answers: { plus_ones: ['Luis Pérez', 'Marta Soto'], comment: 'Vegana, sin gluten', q1: 'Regina George' },
        }),
        guest({ id: 'g2', fullName: 'Bea Soto', approvalStatus: 'pending', claimedAt: null }),
      ],
      config,
    );
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('Ana Rojas,Aprobado,Sí,Sí,2,1,Luis Pérez; Marta Soto,"Vegana, sin gluten",Regina George');
    expect(lines[2]).toBe('Bea Soto,Pendiente,No,No,0,0,,,');
  });

  it('nunca incluye el token del invitado', () => {
    expect(enrollmentToCsv([guest()], config)).not.toContain('TOKEN-SECRETO');
  });

  it('neutraliza las celdas que Excel evaluaría como fórmula', () => {
    const csv = enrollmentToCsv(
      [guest({ fullName: '=HYPERLINK("http://malo")', answers: { comment: '+cmd|calc', q1: '@SUM(A1)' } })],
      config,
    );
    const row = csv.split('\r\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""http://malo"")"`);
    expect(row).toContain(`'+cmd|calc`);
    expect(row).toContain(`'@SUM(A1)`);
  });

  it('no pierde la respuesta a una pregunta que ya se quitó: va en una columna aparte', () => {
    const csv = enrollmentToCsv([guest({ answers: { q1: 'Regina', q3: 'Respuesta vieja' } })], config);
    const [header, row] = csv.split('\r\n');
    expect(header.endsWith('Respuestas a preguntas que ya no están')).toBe(true);
    expect(row.endsWith('Respuesta vieja')).toBe(true);
  });

  it('sin respuestas huérfanas no agrega esa columna', () => {
    const [header] = enrollmentToCsv([guest({ answers: { q1: 'Regina' } })], config).split('\r\n');
    expect(header).not.toContain('ya no están');
  });

  it('también neutraliza las etiquetas de las preguntas', () => {
    const csv = enrollmentToCsv([], { ...config, questions: [{ id: 'q1', label: '=1+1', required: false }] });
    expect(csv.split('\r\n')[0]).toContain(`'=1+1`);
  });
});

describe('guestsToCsv (Fase 0): fórmulas', () => {
  it('neutraliza el nombre y la nota, pero no el teléfono ni el token (son datos de reimportación)', () => {
    const csv = guestsToCsv([
      {
        id: 'g1',
        token: 'tok',
        fullName: '=HYPERLINK("http://malo")',
        status: 'pending',
        plusOnesAllowed: 0,
        plusOnesConfirmed: 0,
        guestNote: '@cmd',
        phone: '+56912345678',
        respondedAt: null,
        checkedInAt: null,
      },
    ]);
    const row = csv.split('\r\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""http://malo"")"`);
    expect(row).toContain(`'@cmd`);
    expect(row).toContain('+56912345678');
    expect(row).not.toContain(`'+56912345678`);
  });
});
