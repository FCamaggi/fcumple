import { useEffect, useState } from 'react';
import {
  listAllPosts,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
  uploadPostImage,
  listPostImages,
  addPostImage,
  getPostImageUrl,
} from '../lib/postsApi';
import type { Post, PostImage } from '../types';

type Draft = { title: string; subtitle: string; body: string };
const EMPTY_DRAFT: Draft = { title: '', subtitle: '', body: '' };

/**
 * PostsPanel — panel de admin para AnnouncementFeed (DESIGN.md §7.8, ahora
 * un feed real en vez del ticker). Sigue el mismo patrón colapsable/estético
 * que EventSettingsForm: lista de todos los posts (incluidos borradores),
 * crear, editar, publicar/despublicar y eliminar, con soporte de autoría
 * rica (subtítulo, imagen destacada, galería).
 */
export default function PostsPanel() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [imagesByPostId, setImagesByPostId] = useState<Record<string, PostImage[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<Draft>(EMPTY_DRAFT);
  const [createDraftId, setCreateDraftId] = useState<string>(() => crypto.randomUUID());
  const [createCoverPath, setCreateCoverPath] = useState<string | null>(null);
  const [createGalleryPaths, setCreateGalleryPaths] = useState<string[]>([]);
  const [uploadingCreate, setUploadingCreate] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editCoverPath, setEditCoverPath] = useState<string | null>(null);
  const [editGalleryImages, setEditGalleryImages] = useState<PostImage[]>([]);
  const [uploadingEdit, setUploadingEdit] = useState(false);

  useEffect(() => {
    let active = true;
    listAllPosts()
      .then(async (found) => {
        if (!active) return;
        setPosts(found);
        const entries = await Promise.all(
          found.map(async (p) => [p.id, await listPostImages(p.id).catch(() => [])] as const),
        );
        if (active) setImagesByPostId(Object.fromEntries(entries));
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

  function resetCreateForm() {
    setCreateDraft(EMPTY_DRAFT);
    setCreateDraftId(crypto.randomUUID());
    setCreateCoverPath(null);
    setCreateGalleryPaths([]);
  }

  async function handleCreateCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingCreate(true);
    try {
      const path = await uploadPostImage(file, createDraftId);
      setCreateCoverPath(path);
    } catch (err) {
      notifyError('subir la imagen destacada', err);
    } finally {
      setUploadingCreate(false);
    }
  }

  async function handleCreateGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setUploadingCreate(true);
    try {
      const paths: string[] = [];
      for (const file of files) {
        paths.push(await uploadPostImage(file, createDraftId));
      }
      setCreateGalleryPaths((prev) => [...prev, ...paths]);
    } catch (err) {
      notifyError('subir las imágenes de la galería', err);
    } finally {
      setUploadingCreate(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await createPost({
        title: createDraft.title,
        body: createDraft.body,
        subtitle: createDraft.subtitle.trim() ? createDraft.subtitle.trim() : null,
        coverImagePath: createCoverPath,
      });
      const galleryImages = await Promise.all(
        createGalleryPaths.map((path, position) => addPostImage({ postId: created.id, storagePath: path, position })),
      );
      setPosts((prev) => [created, ...prev]);
      setImagesByPostId((prev) => ({ ...prev, [created.id]: galleryImages }));
      setCreating(false);
      resetCreateForm();
    } catch (err) {
      notifyError('crear el aviso', err);
    }
  }

  function startEdit(post: Post) {
    setEditingId(post.id);
    setEditDraft({ title: post.title, subtitle: post.subtitle ?? '', body: post.body });
    setEditCoverPath(post.coverImagePath);
    setEditGalleryImages(imagesByPostId[post.id] ?? []);
  }

  async function handleEditCoverChange(e: React.ChangeEvent<HTMLInputElement>, postId: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingEdit(true);
    try {
      const path = await uploadPostImage(file, postId);
      setEditCoverPath(path);
    } catch (err) {
      notifyError('subir la imagen destacada', err);
    } finally {
      setUploadingEdit(false);
    }
  }

  async function handleEditGalleryChange(e: React.ChangeEvent<HTMLInputElement>, postId: string) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setUploadingEdit(true);
    try {
      const added: PostImage[] = [];
      for (const file of files) {
        const path = await uploadPostImage(file, postId);
        const position = editGalleryImages.length + added.length;
        added.push(await addPostImage({ postId, storagePath: path, position }));
      }
      setEditGalleryImages((prev) => [...prev, ...added]);
      setImagesByPostId((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), ...added] }));
    } catch (err) {
      notifyError('subir las imágenes de la galería', err);
    } finally {
      setUploadingEdit(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await updatePost(id, {
        title: editDraft.title,
        body: editDraft.body,
        subtitle: editDraft.subtitle.trim() ? editDraft.subtitle.trim() : null,
        coverImagePath: editCoverPath,
      });
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
            resetCreateForm();
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
          <Field label="Subtítulo" htmlFor="new-post-subtitle">
            <input
              id="new-post-subtitle"
              type="text"
              value={createDraft.subtitle}
              onChange={(e) => setCreateDraft((d) => ({ ...d, subtitle: e.target.value }))}
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
          <Field label="Imagen destacada" htmlFor="new-post-cover">
            <input
              id="new-post-cover"
              type="file"
              accept="image/*"
              onChange={handleCreateCoverChange}
              className="font-sans text-xs text-paper-100/70"
            />
            {createCoverPath && (
              <PostImageThumb path={createCoverPath} alt="Portada" className="mt-1 h-20 w-20 object-cover" />
            )}
          </Field>
          <Field label="Galería (podés elegir varias)" htmlFor="new-post-gallery">
            <input
              id="new-post-gallery"
              type="file"
              accept="image/*"
              multiple
              onChange={handleCreateGalleryChange}
              className="font-sans text-xs text-paper-100/70"
            />
            {createGalleryPaths.length > 0 && (
              <div className="mt-1 flex gap-1">
                {createGalleryPaths.map((path) => (
                  <PostImageThumb key={path} path={path} alt="Foto de galería" className="h-14 w-14 object-cover" />
                ))}
              </div>
            )}
          </Field>
          <button
            type="submit"
            disabled={uploadingCreate}
            className="self-start bg-acid-400 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950 disabled:opacity-50"
          >
            {uploadingCreate ? 'Subiendo...' : 'Crear'}
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
                  <Field label="Subtítulo" htmlFor={`edit-subtitle-${post.id}`}>
                    <input
                      id={`edit-subtitle-${post.id}`}
                      type="text"
                      value={editDraft.subtitle}
                      onChange={(e) => setEditDraft((d) => ({ ...d, subtitle: e.target.value }))}
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
                  <Field label="Imagen destacada" htmlFor={`edit-cover-${post.id}`}>
                    <input
                      id={`edit-cover-${post.id}`}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleEditCoverChange(e, post.id)}
                      className="font-sans text-xs text-paper-100/70"
                    />
                    {editCoverPath && (
                      <PostImageThumb path={editCoverPath} alt="Portada" className="mt-1 h-20 w-20 object-cover" />
                    )}
                  </Field>
                  <Field label="Galería (podés elegir varias)" htmlFor={`edit-gallery-${post.id}`}>
                    <input
                      id={`edit-gallery-${post.id}`}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleEditGalleryChange(e, post.id)}
                      className="font-sans text-xs text-paper-100/70"
                    />
                    {editGalleryImages.length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {editGalleryImages.map((img) => (
                          <PostImageThumb
                            key={img.id}
                            path={img.storagePath}
                            alt="Foto de galería"
                            className="h-14 w-14 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </Field>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={uploadingEdit}
                      className="bg-acid-400 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950 disabled:opacity-50"
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
                <div className="flex gap-3">
                  {post.coverImagePath && (
                    <PostImageThumb
                      path={post.coverImagePath}
                      alt="Portada"
                      className="h-16 w-16 shrink-0 object-cover"
                    />
                  )}
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
                    {post.subtitle && (
                      <p className="font-mono text-xs uppercase tracking-wider text-laser-500">{post.subtitle}</p>
                    )}
                    <p className="font-sans text-sm text-paper-100/70">{post.body}</p>
                    {(imagesByPostId[post.id]?.length ?? 0) > 0 && (
                      <div className="mt-1 flex gap-1">
                        {imagesByPostId[post.id].map((img) => (
                          <PostImageThumb
                            key={img.id}
                            path={img.storagePath}
                            alt="Foto de galería"
                            className="h-10 w-10 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
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

// PostImageThumb — getPostImageUrl es async (createSignedUrl contra el
// bucket privado post-images, ver postsApi.ts), así que ningún <img> puede
// usarlo directo como `src`. Este componente resuelve la URL firmada antes
// de renderizar la miniatura -- se usa en las 6 miniaturas de este panel
// (portada/galería en crear, editar, y la lista de posts existentes).
function PostImageThumb({ path, alt, className }: { path: string; alt: string; className: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPostImageUrl(path)
      .then((u) => {
        if (active) setUrl(u);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
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
