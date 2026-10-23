/**
 * `<input type="datetime-local">` pide "yyyy-MM-ddTHH:mm" en la hora del
 * dispositivo, no un instante ISO: se convierte en los dos sentidos en el borde
 * del formulario. En la base queda un instante (`timestamptz`, ISO en UTC).
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
