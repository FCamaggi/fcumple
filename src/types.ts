export type RsvpStatus = 'pending' | 'confirmed' | 'declined';

export interface EventInfo {
  name: string;
  tagline: string;
  date: string;
  doorsTime: string;
  rsvpDeadline: string; // ISO datetime
  venueName: string;
  venueAddress: string;
  dresscode: string;
  lineup: string;
  capacityTotal: number;
}

/**
 * Mirrors the shape returned by `get_guest_by_token` / `submit_rsvp`
 * (see supabase/README.md). `token`, `adminNote`, `createdAt` and
 * `updatedAt` are only present when the guest comes from the admin's
 * `guests` table (listGuests/createGuest/updateGuest) — the guest-facing
 * RPCs never return them.
 */
export interface Guest {
  id: string;
  token?: string;
  fullName: string;
  status: RsvpStatus;
  plusOnesAllowed: number;
  plusOnesConfirmed: number;
  guestNote: string | null;
  adminNote?: string | null;
  respondedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}
