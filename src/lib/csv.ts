import type { Guest } from '../types';

const EXPORT_HEADER = ['full_name', 'status', 'plus_ones_allowed', 'plus_ones_confirmed', 'guest_note', 'phone'];
// `phone` es opcional al importar (docs/05-comunicacion/sistema-de-mensajes.md):
// un CSV sin esa columna sigue funcionando exactamente igual que antes.
const IMPORT_HEADER = ['full_name', 'plus_ones_allowed', 'phone'];

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
      toCsvLine([g.fullName, g.status, g.plusOnesAllowed, g.plusOnesConfirmed, g.guestNote ?? '', g.phone ?? ''])
    );
  }
  return lines.join('\r\n');
}

export function csvTemplate(): string {
  const lines = [toCsvLine(IMPORT_HEADER), toCsvLine(['Ana Torres', 1, '+56 9 1234 5678'])];
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
  const nameIdx = header.indexOf('full_name');
  const plusOnesIdx = header.indexOf('plus_ones_allowed');
  // Columna opcional: si el CSV no la trae, phoneIdx queda en -1 y cada fila
  // simplemente no incluye `phone`, sin afectar el resto del parseo.
  const phoneIdx = header.indexOf('phone');

  if (nameIdx === -1 || plusOnesIdx === -1) {
    errors.push({ row: 1, message: 'El header debe incluir full_name y plus_ones_allowed' });
    return { valid, errors };
  }

  for (let r = 1; r < rows.length; r++) {
    const rowNumber = r + 1; // 1-based, counting the header as row 1
    const cols = rows[r];
    const fullName = (cols[nameIdx] ?? '').trim();
    const plusOnesRaw = (cols[plusOnesIdx] ?? '').trim();

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
    valid.push(phone ? { fullName, plusOnesAllowed, phone } : { fullName, plusOnesAllowed });
  }

  return { valid, errors };
}
