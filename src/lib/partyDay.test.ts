import { describe, expect, it } from 'vitest';
import { countModerationPhotos, isPartyDay, summarizeCamera } from './partyDay';
import type { OrganizerGuest } from './organizerApi';
import type { ModerationPhoto } from './photosApi';

function photo(status: 'pending' | 'approved' | 'rejected', publishedAt: string | null = null): ModerationPhoto {
  return { id: `p-${Math.random()}`, status, publishedAt } as unknown as ModerationPhoto;
}

function guest(over: Partial<OrganizerGuest> & { id: string }): OrganizerGuest {
  return {
    eventId: 'ev-1',
    fullName: `Invitada ${over.id}`,
    token: 't',
    approvalStatus: 'approved',
    status: 'pending',
    plusOnesAllowed: 0,
    plusOnesConfirmed: 0,
    photoQuota: 5,
    answers: {},
    plusOnesRequested: 0,
    checkedInAt: null,
    claimedAt: null,
    lastSeenAt: null,
    cameraActivatedAt: null,
    ...over,
  } as OrganizerGuest;
}

describe('countModerationPhotos', () => {
  it('cuenta por estado y las aprobadas que aún no se publican', () => {
    const counts = countModerationPhotos([
      photo('pending'),
      photo('pending'),
      photo('approved'),
      photo('approved', '2026-10-30T23:00:00Z'),
      photo('rejected'),
    ]);
    expect(counts).toEqual({ pending: 2, approved: 2, rejected: 1, unpublished: 1 });
  });

  it('sin fotos todo es cero', () => {
    expect(countModerationPhotos([])).toEqual({ pending: 0, approved: 0, rejected: 0, unpublished: 0 });
  });
});

describe('summarizeCamera', () => {
  const guests = [
    guest({ id: 'a', claimedAt: '2026-10-30T20:00:00Z', cameraActivatedAt: '2026-10-30T23:10:00Z' }),
    guest({ id: 'b', claimedAt: '2026-10-30T20:00:00Z', checkedInAt: '2026-10-30T23:00:00Z' }),
    guest({ id: 'c', claimedAt: '2026-10-30T20:00:00Z' }),
    guest({ id: 'd' }),
  ];

  it('con QR del evento, activó quien escaneó el código', () => {
    const s = summarizeCamera('on_event_qr', guests);
    expect(s.total).toBe(4);
    expect(s.activated).toBe(1);
    expect(s.missing.map((g) => g.id)).toEqual(['b', 'c', 'd']);
  });

  it('con check-in, activó quien ya entró por la puerta', () => {
    const s = summarizeCamera('on_checkin', guests);
    expect(s.activated).toBe(1);
    expect(s.missing.map((g) => g.id)).toEqual(['a', 'c', 'd']);
  });

  it('al identificarse la cámara está disponible para todos, también para quien aún no entra', () => {
    const s = summarizeCamera('on_identify', guests);
    expect(s.total).toBe(4);
    expect(s.activated).toBe(4);
    expect(s.missing).toEqual([]);
  });

  it('no cuenta a quien está rechazado o pendiente de aprobación ni a quien declinó', () => {
    const s = summarizeCamera('on_event_qr', [
      guest({ id: 'ok', cameraActivatedAt: '2026-10-30T23:10:00Z' }),
      guest({ id: 'rech', approvalStatus: 'rejected' }),
      guest({ id: 'pend', approvalStatus: 'pending' }),
      guest({ id: 'dec', status: 'declined' }),
    ]);
    expect(s.total).toBe(1);
    expect(s.activated).toBe(1);
    expect(s.missing).toEqual([]);
  });

  it('sin invitados no hay nadie a quien esperar', () => {
    expect(summarizeCamera('on_event_qr', [])).toEqual({ total: 0, activated: 0, missing: [] });
  });
});

describe('isPartyDay', () => {
  const startsAt = '2026-10-30T23:00:00Z';

  it('es el día de la fiesta desde unas horas antes hasta la madrugada siguiente', () => {
    expect(isPartyDay(startsAt, new Date('2026-10-30T12:00:00Z'))).toBe(true);
    expect(isPartyDay(startsAt, new Date('2026-10-31T10:00:00Z'))).toBe(true);
  });

  it('los límites cuentan: 12 h antes y 18 h después todavía es el día; un minuto más allá, no', () => {
    expect(isPartyDay(startsAt, new Date('2026-10-30T11:00:00Z'))).toBe(true);
    expect(isPartyDay(startsAt, new Date('2026-10-30T10:59:00Z'))).toBe(false);
    expect(isPartyDay(startsAt, new Date('2026-10-31T17:00:00Z'))).toBe(true);
    expect(isPartyDay(startsAt, new Date('2026-10-31T17:01:00Z'))).toBe(false);
  });

  it('no lo es días antes ni días después', () => {
    expect(isPartyDay(startsAt, new Date('2026-10-28T23:00:00Z'))).toBe(false);
    expect(isPartyDay(startsAt, new Date('2026-11-02T23:00:00Z'))).toBe(false);
  });

  it('una fecha ilegible o ausente nunca es el día de la fiesta', () => {
    expect(isPartyDay('mañana', new Date())).toBe(false);
    expect(isPartyDay(null, new Date())).toBe(false);
  });
});
