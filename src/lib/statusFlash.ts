import type { RsvpStatus } from '../types';

/**
 * Color de destello por estado, alineado a docs/DESIGN.md sección 4/6.2:
 * confirmado = acid-400, rechazado = flame-500, pendiente = smoke-700 (neutro).
 */
export const STATUS_FLASH_COLOR: Record<RsvpStatus, string> = {
  confirmed: '#c8ff3d', // acid-400
  declined: '#ff5a1f', // flame-500
  pending: '#3a3244', // smoke-700
};

/**
 * Decide si una fila de DoorList debe destellar en el color de su nuevo
 * estado: solo cuando ya existía un estado previo conocido y cambió al
 * actual. El primer render (prevStatus === undefined, fila recién montada)
 * nunca destella — no hay "cambio" que anunciar todavía.
 */
export function shouldFlashOnStatusChange(
  prevStatus: RsvpStatus | undefined,
  nextStatus: RsvpStatus,
): boolean {
  return prevStatus !== undefined && prevStatus !== nextStatus;
}
