import type { Guest } from '../types';

const EXPORT_HEADER = ['token', 'full_name', 'status', 'plus_ones_allowed', 'plus_ones_confirmed', 'guest_note', 'phone'];
// `token` es la clave de upsert al importar: una fila con token existente
// actualiza a ese invitado en vez de crear uno nuevo. `phone`, `status`,
// `plus_ones_confirmed` y `guest_note` son opcionales al importar
// (docs/05-comunicacion/sistema-de-mensajes.md): un CSV sin esas columnas
// sigue funcionando exactamente igual que antes (solo crea invitados).
const IMPORT_HEADER = ['token', 'full_name', 'status', 'plus_ones_allowed', 'plus_ones_confirmed', 'guest_note', 'phone'];

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvLine(fields: Array<string | number>): string {
  return fields.map((f) => escapeCsvField(String(f))).join(',');
}

export function guestsToCsv(guests: Guest[]): string {
  const lines = [toCsvLine(EXPORT_HEADER)];
  for (const g of guests) {
    lines.push(
      toCsvLine([g.token ?? '', g.fullName, g.status, g.plusOnesAllowed, g.plusOnesConfirmed, g.guestNote ?? '', g.phone ?? ''])
    );
  }
  return lines.join('\r\n');
}

export function csvTemplate(): string {
  const lines = [toCsvLine(IMPORT_HEADER), toCsvLine(['', 'Ana Torres', 'pending', 1, 0, '', '+56 9 1234 5678'])];
  return lines.join('\r\n');
}

/**
 * Parses one line of CSV (RFC 4180-ish: quoted fields, "" for escaped quotes,
 * commas and newlines allowed inside quotes). Since embedded newlines inside
 * quoted fields must not be treated as row separators, this function is
 * applied to the whole text at once and returns all rows, not just one line.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const normalized = text.replace(/\r\n/g, '\n');

  function pushField() {
    row.push(field);
    field = '';
  }

  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < normalized.length) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\n') {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  if (field !== '' || row.length > 0) {
    pushRow();
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface ParsedGuestRow {
  fullName: string;
  plusOnesAllowed: number;
  /** Presente solo si el CSV traía una columna `token` con valor no vacío;
   * marca la fila como una actualización de un invitado existente. */
  token?: string;
  /** Solo presente si el CSV traía una columna `status` con valor no vacío. */
  status?: string;
  /** Solo presente si el CSV traía una columna `plus_ones_confirmed` con valor no vacío. */
  plusOnesConfirmed?: number;
  /** Solo presente si el CSV traía una columna `guest_note` con valor no vacío. */
  guestNote?: string;
  /** Solo presente si el CSV traía una columna `phone` con valor no vacío. */
  phone?: string;
}

export interface ParseGuestsCsvError {
  row: number;
  message: string;
}

export interface ParseGuestsCsvResult {
  valid: ParsedGuestRow[];
  errors: ParseGuestsCsvError[];
}

export function parseGuestsCsv(text: string): ParseGuestsCsvResult {
  const rows = parseCsvRows(text);
  const valid: ParsedGuestRow[] = [];
  const errors: ParseGuestsCsvError[] = [];

  if (rows.length === 0) return { valid, errors };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const tokenIdx = header.indexOf('token');
  const nameIdx = header.indexOf('full_name');
  const statusIdx = header.indexOf('status');
  const plusOnesIdx = header.indexOf('plus_ones_allowed');
  const plusOnesConfirmedIdx = header.indexOf('plus_ones_confirmed');
  const guestNoteIdx = header.indexOf('guest_note');
  // Columnas opcionales: si el CSV no las trae, sus índices quedan en -1 y
  // cada fila simplemente no incluye ese campo, sin afectar el resto del parseo.
  const phoneIdx = header.indexOf('phone');

  if (nameIdx === -1 || plusOnesIdx === -1) {
    errors.push({ row: 1, message: 'El header debe incluir full_name y plus_ones_allowed' });
    return { valid, errors };
  }

  for (let r = 1; r < rows.length; r++) {
    const rowNumber = r + 1; // 1-based, counting the header as row 1
    const cols = rows[r];
    const token = tokenIdx === -1 ? '' : (cols[tokenIdx] ?? '').trim();
    const fullName = (cols[nameIdx] ?? '').trim();
    const statusRaw = statusIdx === -1 ? '' : (cols[statusIdx] ?? '').trim();
    const plusOnesRaw = (cols[plusOnesIdx] ?? '').trim();
    const plusOnesConfirmedRaw = plusOnesConfirmedIdx === -1 ? '' : (cols[plusOnesConfirmedIdx] ?? '').trim();
    const guestNoteRaw = guestNoteIdx === -1 ? undefined : (cols[guestNoteIdx] ?? '').trim();

    if (!fullName) {
      errors.push({ row: rowNumber, message: 'Falta el nombre completo' });
      continue;
    }

    if (!/^-?\d+$/.test(plusOnesRaw)) {
      errors.push({ row: rowNumber, message: 'plus_ones_allowed debe ser numérico' });
      continue;
    }

    const plusOnesAllowed = Number(plusOnesRaw);
    if (plusOnesAllowed < 0) {
      errors.push({ row: rowNumber, message: 'plus_ones_allowed no puede ser negativo' });
      continue;
    }

    const phone = phoneIdx === -1 ? '' : (cols[phoneIdx] ?? '').trim();

    let status: string | undefined;
    if (statusRaw) {
      if (!['pending', 'confirmed', 'declined'].includes(statusRaw)) {
        errors.push({ row: rowNumber, message: 'status debe ser pending, confirmed o declined' });
        continue;
      }
      status = statusRaw;
    }

    let plusOnesConfirmed: number | undefined;
    if (plusOnesConfirmedRaw) {
      if (!/^\d+$/.test(plusOnesConfirmedRaw)) {
        errors.push({ row: rowNumber, message: 'plus_ones_confirmed debe ser numérico' });
        continue;
      }
      plusOnesConfirmed = Number(plusOnesConfirmedRaw);
      if (plusOnesConfirmed < 0) {
        errors.push({ row: rowNumber, message: 'plus_ones_confirmed no puede ser negativo' });
        continue;
      }
    }

    const parsedRow: ParsedGuestRow = { fullName, plusOnesAllowed };
    if (token) parsedRow.token = token;
    if (status) parsedRow.status = status;
    if (plusOnesConfirmed !== undefined) parsedRow.plusOnesConfirmed = plusOnesConfirmed;
    if (guestNoteRaw !== undefined && guestNoteRaw !== '') parsedRow.guestNote = guestNoteRaw;
    if (phone) parsedRow.phone = phone;

    valid.push(parsedRow);
  }

  return { valid, errors };
}
