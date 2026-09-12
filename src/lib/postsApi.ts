import { supabase } from './supabaseClient';
import type { Post } from '../types';

const POST_COLUMNS = 'id, title, body, published_at, created_at';

interface PostRow {
  id: string;
  title: string;
  body: string;
  published_at: string | null;
  created_at: string;
}

function mapRow(row: PostRow): Post {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at,
    createdAt: row.created_at,
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
}

// New posts always start as a draft — publishing is a deliberate, separate
// action (see publishPost below).
export async function createPost(input: CreatePostInput): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .insert({ title: input.title, body: input.body, published_at: null })
    .select(POST_COLUMNS)
    .single();

  if (error) fail('crear el aviso', error);
  return mapRow(data as unknown as PostRow);
}

export interface UpdatePostPatch {
  title?: string;
  body?: string;
  publishedAt?: string | null;
}

// Explicit allowlist: `id` and `created_at` can never be written through
// this function, no matter what a caller passes in `patch`.
function toRow(patch: UpdatePostPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.body !== undefined) row.body = patch.body;
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
