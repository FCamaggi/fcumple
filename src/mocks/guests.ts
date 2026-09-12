import type { Guest } from '../types';

// Test fixtures only — the real app fetches guests via `lib/guestApi.ts` and
// `lib/adminApi.ts`. Kept in the shape returned by the real Supabase contract
// (see supabase/README.md).
export const guests: Guest[] = [
  {
    id: 'g1',
    token: 'mafe-8842',
    fullName: 'Maria Fernanda Contreras Espinoza',
    status: 'confirmed',
    plusOnesAllowed: 3,
    plusOnesConfirmed: 2,
    guestNote: 'Avisale a DJ Valk que prepare el remix de acid techno de las 3 AM.',
    adminNote: 'Amiga directa de Valk. No cobrar pulsera VIP.',
    respondedAt: '2026-05-20T00:35:00-04:00',
    createdAt: '2026-05-20T00:32:00-04:00',
    updatedAt: '2026-05-20T00:35:00-04:00',
  },
  {
    id: 'g2',
    token: 'joaquin-8843',
    fullName: 'Joaquín Valenzuela R.',
    status: 'confirmed',
    plusOnesAllowed: 2,
    plusOnesConfirmed: 1,
    guestNote: 'Entra con equipo fotográfico.',
    adminNote: null,
    respondedAt: '2026-05-20T00:44:00-04:00',
    createdAt: '2026-05-20T00:41:00-04:00',
    updatedAt: '2026-05-20T00:44:00-04:00',
  },
  {
    id: 'g3',
    token: 'sofia-8844',
    fullName: 'Sofía Del Solar',
    status: 'pending',
    plusOnesAllowed: 2,
    plusOnesConfirmed: 0,
    guestNote: null,
    adminNote: null,
    respondedAt: null,
    createdAt: '2026-05-20T00:52:00-04:00',
    updatedAt: '2026-05-20T00:52:00-04:00',
  },
  {
    id: 'g5',
    token: 'bruno-8846',
    fullName: 'Bruno Alarcón',
    status: 'declined',
    plusOnesAllowed: 1,
    plusOnesConfirmed: 0,
    guestNote: 'Liberó cupo voluntario.',
    adminNote: null,
    respondedAt: '2026-05-20T01:10:00-04:00',
    createdAt: '2026-05-20T01:05:00-04:00',
    updatedAt: '2026-05-20T01:10:00-04:00',
  },
];

export function findGuestByToken(token: string): Guest | undefined {
  return guests.find((g) => g.token === token);
}
