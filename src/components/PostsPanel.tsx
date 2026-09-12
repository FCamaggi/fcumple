import { useEffect, useState } from 'react';
import {
  listAllPosts,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
} from '../lib/postsApi';
import type { Post } from '../types';

type Draft = { title: string; body: string };
const EMPTY_DRAFT: Draft = { title: '', body: '' };

/**
 * PostsPanel — panel de admin para AnnouncementTicker (DESIGN.md §7.8).
 * Sigue el mismo patrón colapsable/estético que EventSettingsForm: lista de
 * todos los posts (incluidos borradores), crear, editar, publicar/
 * despublicar y eliminar.
 */
export default function PostsPanel() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<Draft>(EMPTY_DRAFT);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);

  useEffect(() => {
    let active = true;
    listAllPosts()
      .then((found) => {
        if (active) setPosts(found);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'No pudimos cargar los avisos.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function notifyError(action: string, err: unknown) {
    setError(err instanceof Error ? err.message : `No pudimos ${action}.`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await createPost({ title: createDraft.title, body: createDraft.body });
      setPosts((prev) => [created, ...prev]);
      setCreating(false);
      setCreateDraft(EMPTY_DRAFT);
    } catch (err) {
      notifyError('crear el aviso', err);
    }
  }

  function startEdit(post: Post) {
    setEditingId(post.id);
    setEditDraft({ title: post.title, body: post.body });
  }

  async function handleSaveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await updatePost(id, { title: editDraft.title, body: editDraft.body });
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingId(null);
    } catch (err) {
      notifyError('actualizar el aviso', err);
    }
  }

  async function handleTogglePublish(post: Post) {
    setError(null);
    try {
      const updated = post.publishedAt ? await unpublishPost(post.id) : await publishPost(post.id);
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      notifyError('cambiar el estado del aviso', err);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deletePost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (err) {
      notifyError('eliminar el aviso', err);
    }
  }

  return (
    <section className="flex flex-col gap-4 border border-smoke-700/50 bg-ink-900 p-6 shadow-2xl">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-acid-400">Avisos // cartelera</span>
        <button
          type="button"
          onClick={() => {
            setCreating((v) => !v);
            setCreateDraft(EMPTY_DRAFT);
          }}
          className="border border-smoke-700/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-acid-400 transition-colors hover:bg-acid-400/10"
        >
          {creating ? 'Cancelar' : 'Nuevo aviso'}
        </button>
      </div>

      {error && <p className="font-mono text-[11px] uppercase tracking-wider text-flame-500">{error}</p>}

      {creating && (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 bg-ink-950 p-4">
          <Field label="Título" htmlFor="new-post-title">
            <input
              id="new-post-title"
              type="text"
              required
              value={createDraft.title}
              onChange={(e) => setCreateDraft((d) => ({ ...d, title: e.target.value }))}
              className="bg-ink-900 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
            />
          </Field>
          <Field label="Cuerpo" htmlFor="new-post-body">
            <textarea
              id="new-post-body"
              required
              rows={3}
              value={createDraft.body}
              onChange={(e) => setCreateDraft((d) => ({ ...d, body: e.target.value }))}
              className="resize-none bg-ink-900 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
            />
          </Field>
          <button
            type="submit"
            className="self-start bg-acid-400 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950"
          >
            Crear
          </button>
        </form>
      )}

      {loading ? (
        <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">Cargando...</span>
      ) : posts.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
          Todavía no hay avisos. Creá el primero.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) =>
            editingId === post.id ? (
              <li key={post.id} className="bg-ink-950 p-4">
                <form onSubmit={(e) => handleSaveEdit(e, post.id)} className="flex flex-col gap-3">
                  <Field label="Título" htmlFor={`edit-title-${post.id}`}>
                    <input
                      id={`edit-title-${post.id}`}
                      type="text"
                      required
                      value={editDraft.title}
                      onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                      className="bg-ink-900 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
                    />
                  </Field>
                  <Field label="Cuerpo" htmlFor={`edit-body-${post.id}`}>
                    <textarea
                      id={`edit-body-${post.id}`}
                      required
                      rows={3}
                      value={editDraft.body}
                      onChange={(e) => setEditDraft((d) => ({ ...d, body: e.target.value }))}
                      className="resize-none bg-ink-900 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
                    />
                  </Field>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="bg-acid-400 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="border border-smoke-700/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={post.id} className="flex items-start justify-between gap-3 bg-ink-950 p-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                        post.publishedAt ? 'bg-acid-400/10 text-acid-400' : 'bg-smoke-700/30 text-paper-100/70'
                      }`}
                    >
                      {post.publishedAt ? 'Publicado' : 'Borrador'}
                    </span>
                    <h3 className="font-display text-lg uppercase leading-none text-paper-100">{post.title}</h3>
                  </div>
                  <p className="font-sans text-sm text-paper-100/70">{post.body}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(post)}
                    className="border border-smoke-700/50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-laser-500 transition-colors hover:bg-laser-500/10"
                  >
                    {post.publishedAt ? 'Despublicar' : 'Publicar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(post)}
                    className="border border-smoke-700/50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-paper-100 transition-colors hover:bg-smoke-700/30"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(post.id)}
                    className="border border-smoke-700/50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-flame-500 transition-colors hover:bg-flame-500/10"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
        {label}
      </label>
      {children}
    </div>
  );
}
