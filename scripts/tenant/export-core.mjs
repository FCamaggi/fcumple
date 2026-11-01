/**
 * Pure core export logic for tenant local backups.
 * ESM, no network dependencies.
 */

const KNOWN_TABLES = [
  'guests',
  'guest_credentials',
  'photos',
  'posts',
  'post_images',
  'event_frames',
  'event_stickers',
  'client_briefs',
];

/**
 * Collects all database rows and storage object metadata for a given event tenant.
 *
 * @param {Function} query - Function with signature (sql, params) => Promise<{ rows: any[] }>
 * @param {string} slug - Event slug identifier
 * @returns {Promise<{ event: object, tables: object, storageObjects: object[] }>}
 */
export async function collectTenant(query, slug) {
  if (!slug || typeof slug !== 'string') {
    throw new Error(`No existe un evento con el slug "${slug}".`);
  }

  // 1. Fetch event row
  const eventRes = await query(
    'SELECT * FROM public.events WHERE slug = $1',
    [slug]
  );

  if (!eventRes?.rows || eventRes.rows.length === 0) {
    throw new Error(`No existe un evento con el slug "${slug}".`);
  }

  const rawEvent = eventRes.rows[0];
  const event = {
    ...rawEvent,
    activation_code:
      rawEvent.activation_code != null ? '[redactado]' : rawEvent.activation_code,
  };

  const eventId = event.id;

  // 2. Fetch guests (token redacted)
  const guestsRes = await query(
    'SELECT * FROM public.guests WHERE event_id = $1 ORDER BY created_at, id',
    [eventId]
  );
  const guests = (guestsRes?.rows || []).map((row) => ({
    ...row,
    token: row.token != null ? '[redactado]' : row.token,
  }));

  // 3. Fetch guest_credentials joined through guests.
  // CRITICAL: NEVER select pin_hash. Only guest_id, failed_count, locked_until.
  const credentialsRes = await query(
    `SELECT gc.guest_id, gc.failed_count, gc.locked_until
     FROM public.guest_credentials gc
     JOIN public.guests g ON g.id = gc.guest_id
     WHERE g.event_id = $1
     ORDER BY gc.guest_id`,
    [eventId]
  );
  const guestCredentials = credentialsRes?.rows || [];

  // 4. Fetch photos
  const photosRes = await query(
    'SELECT * FROM public.photos WHERE event_id = $1 ORDER BY created_at, id',
    [eventId]
  );
  const photos = photosRes?.rows || [];

  // 5. Fetch posts
  const postsRes = await query(
    'SELECT * FROM public.posts WHERE event_id = $1 ORDER BY created_at, id',
    [eventId]
  );
  const posts = postsRes?.rows || [];

  // 6. Fetch post_images
  const postImagesRes = await query(
    'SELECT * FROM public.post_images WHERE event_id = $1 ORDER BY created_at, id',
    [eventId]
  );
  const postImages = postImagesRes?.rows || [];

  // 7. Fetch event_frames
  const eventFramesRes = await query(
    'SELECT * FROM public.event_frames WHERE event_id = $1 ORDER BY created_at, id',
    [eventId]
  );
  const eventFrames = eventFramesRes?.rows || [];

  // 8. Fetch event_stickers
  const eventStickersRes = await query(
    'SELECT * FROM public.event_stickers WHERE event_id = $1 ORDER BY created_at, id',
    [eventId]
  );
  const eventStickers = eventStickersRes?.rows || [];

  // 9. Fetch client_briefs where slug = event.slug
  const clientBriefsRes = await query(
    'SELECT * FROM public.client_briefs WHERE slug = $1 ORDER BY created_at, id',
    [event.slug]
  );
  const clientBriefs = clientBriefsRes?.rows || [];

  // 10. Fetch storageObjects from storage.objects
  // Bucket in ('party-photos', 'post-images', 'event-assets') and name LIKE event_id || '/%'
  // Ordered by bucket_id, name.
  // Note: Handles cases where metadata column might not exist in simplified test schemas.
  let storageObjects;
  try {
    const storageRes = await query(
      `SELECT bucket_id, name, metadata
       FROM storage.objects
       WHERE bucket_id IN ('party-photos', 'post-images', 'event-assets')
         AND name LIKE $1
       ORDER BY bucket_id, name`,
      [`${eventId}/%`]
    );
    storageObjects = storageRes?.rows || [];
  } catch (err) {
    if (err && String(err.message).includes('metadata')) {
      const storageRes = await query(
        `SELECT bucket_id, name, null AS metadata
         FROM storage.objects
         WHERE bucket_id IN ('party-photos', 'post-images', 'event-assets')
           AND name LIKE $1
         ORDER BY bucket_id, name`,
        [`${eventId}/%`]
      );
      storageObjects = storageRes?.rows || [];
    } else {
      throw err;
    }
  }

  const tables = {
    guests,
    guest_credentials: guestCredentials,
    photos,
    posts,
    post_images: postImages,
    event_frames: eventFrames,
    event_stickers: eventStickers,
    client_briefs: clientBriefs,
  };

  return {
    event,
    tables,
    storageObjects,
  };
}

/**
 * Builds the export manifest structure.
 *
 * @param {object} params
 * @param {string} params.slug
 * @param {object} params.event
 * @param {object} [params.tables]
 * @param {Array<{ bucket: string, name: string, bytes: number, sha256: string }>} [params.files]
 * @param {string} [params.exportedAt]
 * @returns {object}
 */
export function buildManifest({ slug, event, tables = {}, storageObjects, files = [], exportedAt }) {
  const counts = {};
  for (const name of KNOWN_TABLES) {
    counts[name] = Array.isArray(tables?.[name]) ? tables[name].length : 0;
  }
  if (tables) {
    for (const [key, val] of Object.entries(tables)) {
      if (!(key in counts) && Array.isArray(val)) {
        counts[key] = val.length;
      }
    }
  }
  // Objects listed in Storage, whether or not they were downloaded (--sin-archivos).
  counts.storage_objects = Array.isArray(storageObjects)
    ? storageObjects.length
    : Array.isArray(files) ? files.length : 0;
  counts.files_downloaded = Array.isArray(files) ? files.length : 0;

  return {
    format: 'fcumple-tenant-export/v1',
    slug: slug ?? event?.slug,
    event_id: event?.id,
    exported_at: exportedAt ?? new Date().toISOString(),
    counts,
    files: Array.isArray(files) ? files : [],
    redacted: ['events.activation_code', 'guests.token'],
    excluded: ['guest_credentials.pin_hash', 'identify_attempts'],
  };
}
