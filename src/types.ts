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
  photosRevealedAt: string | null; // ISO datetime; null = rollo sin revelar
}

export interface EventInfo {
  name: string;
  tagline: string;
  date: string;
  doorsTime: string;
  rsvpDeadline: string; // ISO datetime
  venueName: string;
  venueAddress: string;
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
/**
 * Mirrors `public.posts` (see
 * supabase/migrations/20260912090000_create_posts.sql, extended in Etapa 5
 * with `subtitle` and `cover_image_path`, both nullable). `publishedAt` is
 * `null` for a draft; a non-null value in the past or present means the
 * post is live for guests, and a future value schedules it.
 */
export interface Post {
  id: string;
  title: string;
  subtitle: string | null;
  body: string;
  coverImagePath: string | null;
  publishedAt: string | null;
  createdAt: string;
}

/**
 * Mirrors `public.post_images` (Etapa 5): the gallery images attached to a
 * post, ordered by `position`. Actual file bytes live in the
 * `post-images` Storage bucket at `storagePath`.
 */
export interface PostImage {
  id: string;
  postId: string;
  storagePath: string;
  position: number;
}

/**
 * Mirrors `get_photo_quota` (see supabase/README.md): `quota` is
 * `guests.photo_quota` for the token's guest, `used` counts every photo of
 * that guest regardless of status (pending + approved + rejected).
 */
export interface PhotoQuota {
  quota: number;
  used: number;
}

/**
 * Mirrors `public.photos` (see
 * supabase/migrations/20260912100002_create_photos.sql). The actual file
 * bytes live in the `party-photos` Storage bucket at `storagePath`.
 */
export interface Photo {
  id: string;
  guestId: string;
  storagePath: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

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
  /** Null until the guest is scanned in at the door (Etapa 3: check-in QR). */
  checkedInAt: string | null;
  /**
   * True only for the fixed dev-preview seed guest (Etapa 5, Parte B) --
   * only `listGuests`/adminApi expose this (`guests.is_dev`); guest-facing
   * RPCs don't need to know it. Never present on guest-facing screens.
   */
  isDev?: boolean;
  /**
   * `guests.photo_quota` (column already exists in the database, default
   * 5) -- how many photos this guest may upload to the camera roll.
   * Admin-facing only; not to be confused with `PhotoQuota`, the
   * `{quota, used}` shape returned by `get_photo_quota` for the guest-facing
   * camera flow.
   */
  photoQuota?: number;
}
