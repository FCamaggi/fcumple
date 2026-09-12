export type RsvpStatus = 'pending' | 'confirmed' | 'declined';

/**
 * Mirrors the single-row `event_config` table (see
 * supabase/migrations/20260911120005_create_event_config.sql). Every
 * column besides `id` is nullable: the row may not exist yet, or the
 * admin may have only filled in some fields.
 */
export interface EventConfig {
  eventName: string | null;
  eventDate: string | null; // ISO datetime
  location: string | null;
  theme: string | null;
  rsvpDeadline: string | null; // ISO datetime
}

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
