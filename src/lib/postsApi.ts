import { supabase } from './supabaseClient';
import type { Post, PostImage } from '../types';

const POST_COLUMNS = 'id, title, subtitle, body, cover_image_path, published_at, created_at';
const POST_IMAGES_BUCKET = 'post-images';

interface PostRow {
  id: string;
  title: string;
  subtitle: string | null;
  body: string;
  cover_image_path: string | null;
  published_at: string | null;
  created_at: string;
}

function mapRow(row: PostRow): Post {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    coverImagePath: row.cover_image_path,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

interface PostImageRow {
  id: string;
  post_id: string;
  storage_path: string;
  position: number;
}

function mapImageRow(row: PostImageRow): PostImage {
  return {
    id: row.id,
    postId: row.post_id,
    storagePath: row.storage_path,
    position: row.position,
  };
}

function fail(action: string, error: { message?: string } | null): never {
  throw new Error(`No pudimos ${action}: ${error?.message ?? 'error desconocido'}`);
}

// For the guest-facing surface: only posts that are actually live right
// now (published_at set and not in the future), most recent first. Mirrors
// the RLS policy in the migration so the same rule reads the same way on
// both sides.
export async function listPublishedPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_COLUMNS)
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false });

  if (error) fail('cargar los avisos', error);
  return ((data ?? []) as unknown as PostRow[]).map(mapRow);
}

// For the admin: every post, drafts included, most recently created first.
export async function listAllPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) fail('cargar los avisos', error);
  return ((data ?? []) as unknown as PostRow[]).map(mapRow);
}

export interface CreatePostInput {
  title: string;
  body: string;
  subtitle?: string | null;
  coverImagePath?: string | null;
}

// New posts always start as a draft — publishing is a deliberate, separate
// action (see publishPost below).
export async function createPost(input: CreatePostInput): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      title: input.title,
      body: input.body,
      subtitle: input.subtitle ?? null,
      cover_image_path: input.coverImagePath ?? null,
      published_at: null,
    })
    .select(POST_COLUMNS)
    .single();

  if (error) fail('crear el aviso', error);
  return mapRow(data as unknown as PostRow);
}

export interface UpdatePostPatch {
  title?: string;
  body?: string;
  subtitle?: string | null;
  coverImagePath?: string | null;
  publishedAt?: string | null;
}

// Explicit allowlist: `id` and `created_at` can never be written through
// this function, no matter what a caller passes in `patch`.
function toRow(patch: UpdatePostPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.subtitle !== undefined) row.subtitle = patch.subtitle;
  if (patch.coverImagePath !== undefined) row.cover_image_path = patch.coverImagePath;
  if (patch.publishedAt !== undefined) row.published_at = patch.publishedAt;
  return row;
}

export async function updatePost(id: string, patch: UpdatePostPatch): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .update(toRow(patch))
    .eq('id', id)
    .select(POST_COLUMNS)
    .single();

  if (error) fail('actualizar el aviso', error);
  return mapRow(data as unknown as PostRow);
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) fail('eliminar el aviso', error);
}

export function publishPost(id: string): Promise<Post> {
  return updatePost(id, { publishedAt: new Date().toISOString() });
}

export function unpublishPost(id: string): Promise<Post> {
  return updatePost(id, { publishedAt: null });
}

// Uploads to the `post-images` Storage bucket at `{postId}/{uuid}-{filename}`
// -- scoped by post id like `party-photos` is scoped by guest token, but
// this bucket is only ever written by `authenticated` (the admin), never by
// a guest (see supabase/README.md conventions this mirrors). Returns just
// the storage path; the caller decides whether it's the post's cover or a
// gallery image.
export async function uploadPostImage(file: File, postId: string): Promise<string> {
  const path = `${postId}/${crypto.randomUUID()}-${file.name}`;

  const { error } = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
  });

  if (error) fail('subir la imagen', error);
  return path;
}

// El bucket post-images es privado (ver supabase/migrations/
// 20260913100001_storage_post_images.sql, bucket público=false + policy
// vía la función puente post_image_path_is_public). getPublicUrl() ignora
// RLS por completo y solo sirve el archivo si el bucket tiene public=true
// en storage.buckets -- con un bucket privado esa ruta da 404/400 siempre,
// publicado o no. createSignedUrl() es el mismo patrón que ya usa
// getSignedPhotoUrl() en photosApi.ts para party-photos (también privado).
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function getPostImageUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(POST_IMAGES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) fail('generar el link de la imagen', error);
  return (data as { signedUrl: string }).signedUrl;
}

export async function listPostImages(postId: string): Promise<PostImage[]> {
  const { data, error } = await supabase
    .from('post_images')
    .select('id, post_id, storage_path, position')
    .eq('post_id', postId)
    .order('position', { ascending: true });

  if (error) fail('cargar las imágenes del aviso', error);
  return ((data ?? []) as unknown as PostImageRow[]).map(mapImageRow);
}

export interface AddPostImageInput {
  postId: string;
  storagePath: string;
  position: number;
}

export async function addPostImage(input: AddPostImageInput): Promise<PostImage> {
  const { data, error } = await supabase
    .from('post_images')
    .insert({ post_id: input.postId, storage_path: input.storagePath, position: input.position })
    .select('id, post_id, storage_path, position')
    .single();

  if (error) fail('registrar la imagen del aviso', error);
  return mapImageRow(data as unknown as PostImageRow);
}

export async function deletePostImage(id: string): Promise<void> {
  const { error } = await supabase.from('post_images').delete().eq('id', id);
  if (error) fail('eliminar la imagen del aviso', error);
}
