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
  /**
   * Path of the smaller, bandwidth-friendly "display" copy of this photo in
   * the same Storage bucket, or `null` when this photo predates the
   * feature (or its display copy failed to generate/upload -- see
   * `uploadPhoto` in `lib/photosApi.ts`). Viewing UI should prefer this
   * over `storagePath`, falling back to the original when it's null;
   * downloads must always use `storagePath` regardless.
   */
  displayStoragePath: string | null;
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
  /**
   * Teléfono de WhatsApp del invitado (columna `guests.phone`, opcional,
   * cargada a mano por el admin) -- ver
   * docs/05-comunicacion/sistema-de-mensajes.md. Solo lo usa SendInviteButton
   * para armar un link `wa.me/<numero>` directo; es un dato sensible, nunca
   * expuesto por las RPCs guest-facing ni mostrado fuera del formulario de
   * edición del admin.
   */
  phone?: string | null;
  /**
   * `guests.auto_approve_photos` (column default `true`) -- whether this
   * guest's photos skip the moderation queue and land as `'approved'`
   * directly (see `submit_photo` in supabase/README.md). Admin-facing only
   * (same convention as `photoQuota`/`isDev`) -- guest-facing RPCs
   * (get_guest_by_token, submit_rsvp, check_in_guest, dev_reset_guest)
   * never return it, so it's optional here rather than required.
   * Admin-editable via `GuestEditModal`; treat `undefined` the same as
   * `true` (checked by default) since the DB column itself defaults to
   * `true`.
   */
  autoApprovePhotos?: boolean;
}
