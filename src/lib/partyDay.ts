import type { CameraUnlock, OrganizerGuest } from './organizerApi';
import type { ModerationPhoto } from './photosApi';

/** Lo que la organizadora necesita saber durante la fiesta, sacado de lo que el panel ya carga. */

export interface PhotoCounts {
  pending: number;
  approved: number;
  rejected: number;
  /** Aprobadas que todavía no están en la cartelera de los invitados. */
  unpublished: number;
}

export function countModerationPhotos(photos: readonly ModerationPhoto[]): PhotoCounts {
  const result: PhotoCounts = { pending: 0, approved: 0, rejected: 0, unpublished: 0 };
  for (const photo of photos) {
    result[photo.status] += 1;
    if (photo.status === 'approved' && !photo.publishedAt) result.unpublished += 1;
  }
  return result;
}

export interface CameraSummary {
  /** A quienes se espera en la fiesta: aprobados y que no declinaron. */
  total: number;
  activated: number;
  /** Quienes aún no tienen la cámara habilitada, en el orden de la lista de invitados. */
  missing: OrganizerGuest[];
}

/** Qué cuenta como «cámara activada» depende de cómo se habilita en este evento (`camera_unlock`). */
function hasCamera(mode: CameraUnlock, guest: OrganizerGuest): boolean {
  if (mode === 'on_event_qr') return guest.cameraActivatedAt !== null;
  if (mode === 'on_checkin') return guest.checkedInAt !== null;
  return guest.claimedAt !== null;
}

export function summarizeCamera(mode: CameraUnlock, guests: readonly OrganizerGuest[]): CameraSummary {
  const expected = guests.filter((g) => g.approvalStatus === 'approved' && g.status !== 'declined');
  const missing = expected.filter((g) => !hasCamera(mode, g));
  return { total: expected.length, activated: expected.length - missing.length, missing };
}

const HOUR = 3_600_000;

/** Es «el día de la fiesta» desde 12 h antes del inicio hasta 18 h después (las fiestas pasan de medianoche). */
export function isPartyDay(startsAt: string | null, now: Date): boolean {
  if (startsAt === null) return false;
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return false;
  const t = now.getTime();
  return t >= start - 12 * HOUR && t <= start + 18 * HOUR;
}
