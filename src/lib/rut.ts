/**
 * Utilidades de RUT chileno. Solo formato y dígito verificador: el RUT se usa
 * para llenar el campo del formulario y para validarlo antes de consultar a un
 * proveedor de identidad; la plataforma NUNCA lo guarda (ver
 * docs/fase-1-mvp-multitenant/acceso-de-invitados.md).
 */

/** Dígito verificador (módulo 11) para el cuerpo numérico de un RUT. */
export function computeCheckDigit(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  if (dv === 11) return '0';
  if (dv === 10) return 'K';
  return String(dv);
}

/**
 * Devuelve el RUT en forma canónica `12345678-5` (sin puntos, `K` en
 * mayúscula) o `null` si no tiene forma de RUT. No comprueba el dígito
 * verificador: para eso está `isValidRut`.
 */
export function normalizeRut(input: string): string | null {
  const cleaned = input.replace(/[.\s-]/g, '').toUpperCase();
  const match = /^(\d{7,8})([0-9K])$/.exec(cleaned);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

export function isValidRut(input: string): boolean {
  const normalized = normalizeRut(input);
  if (!normalized) return false;
  const [body, dv] = normalized.split('-');
  return computeCheckDigit(body) === dv;
}

/** Formatea mientras se escribe: `12.345.678-5`. Ignora todo lo que no sea dígito o K. */
export function formatRutInput(input: string): string {
  const cleaned = input.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (cleaned.length <= 1) return cleaned;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}
