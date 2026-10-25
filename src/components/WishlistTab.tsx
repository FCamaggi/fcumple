import { useState } from 'react';
import {
  fetchLinkPreview,
  resolveWishlist,
  type WishlistConfig,
  type WishlistDisplayMode,
  type WishlistItem,
} from '../lib/wishlist';
import type { OrganizerEvent } from '../lib/organizerApi';

interface WishlistTabProps {
  event: OrganizerEvent;
  onUpdateEvent: (patch: { wishlist: WishlistConfig }) => Promise<void>;
}

export default function WishlistTab({ event, onUpdateEvent }: WishlistTabProps) {
  const currentWishlist = resolveWishlist(event.wishlist);

  const [enabled, setEnabled] = useState(currentWishlist.enabled);
  const [title, setTitle] = useState(currentWishlist.title || 'Lista de regalos');
  const [displayMode, setDisplayMode] = useState<WishlistDisplayMode>(currentWishlist.displayMode);
  const [items, setItems] = useState<WishlistItem[]>(currentWishlist.items);

  // Formulario para nuevo ítem
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Guardado general
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFetchPreview() {
    if (!newUrl.trim()) {
      setFormError('Ingresa un enlace para extraer su vista previa.');
      return;
    }
    if (!/^https?:\/\//i.test(newUrl.trim())) {
      setFormError('El enlace debe comenzar con http:// o https://');
      return;
    }

    setFormError(null);
    setPreviewLoading(true);

    try {
      const preview = await fetchLinkPreview(newUrl.trim());
      if (preview.title) setNewTitle(preview.title);
      if (preview.imageUrl) setNewImageUrl(preview.imageUrl);
      if (preview.description && !newNotes) setNewNotes(preview.description);
    } catch {
      setFormError('No se pudo extraer la vista previa automáticamente. Puedes escribir los datos a mano.');
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newUrl.trim()) {
      setFormError('El enlace es obligatorio.');
      return;
    }
    if (!/^https?:\/\//i.test(newUrl.trim())) {
      setFormError('El enlace debe comenzar con http:// o https://');
      return;
    }
    if (!newTitle.trim()) {
      setFormError('El título o nombre del regalo es obligatorio.');
      return;
    }
    if (items.length >= 30) {
      setFormError('Llegaste al máximo de 30 regalos.');
      return;
    }

    const newItem: WishlistItem = {
      id: Math.random().toString(36).slice(2, 10),
      url: newUrl.trim(),
      title: newTitle.trim(),
      imageUrl: newImageUrl.trim() || null,
      price: newPrice.trim() || null,
      notes: newNotes.trim() || null,
    };

    setItems([...items, newItem]);
    setNewUrl('');
    setNewTitle('');
    setNewImageUrl('');
    setNewPrice('');
    setNewNotes('');
    setFormError(null);
  }

  function handleRemoveItem(id: string) {
    setItems(items.filter((it) => it.id !== id));
  }

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    const payload: WishlistConfig = {
      enabled,
      title: title.trim() || 'Lista de regalos',
      displayMode,
      items,
    };

    try {
      await onUpdateEvent({ wishlist: payload });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'No pudimos guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6" aria-label="Gestión de lista de regalos">
      {/* Configuración de visibilidad */}
      <section className="flex flex-col gap-4 rounded bg-ink-900 p-4 shadow-xl">
        <h2 className="font-display text-base uppercase tracking-wide text-laser-500">
          Visibilidad en la Cartelera
        </h2>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 accent-laser-500"
          />
          <span className="font-sans text-sm text-paper-100">
            Mostrar lista de regalos a los invitados en la cartelera
          </span>
        </label>

        {enabled && (
          <div className="flex flex-col gap-4 border-t border-smoke-700/40 pt-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="wishlist-title" className="font-mono text-xs uppercase tracking-wider text-paper-100/70">
                Título de la sección
              </label>
              <input
                id="wishlist-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                className="h-11 rounded border border-smoke-700 bg-ink-950 px-3 font-sans text-sm text-paper-100 focus:border-laser-500 focus:outline-none"
                placeholder="Ej: Lista de deseos, Regalos de Fran"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-wider text-paper-100/70">
                Formato en la cartelera
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDisplayMode('chip')}
                  className={`flex min-h-[44px] flex-col justify-center rounded border p-3 text-left ${
                    displayMode === 'chip'
                      ? 'border-laser-500 bg-laser-500/10 text-paper-100'
                      : 'border-smoke-700/60 bg-ink-950 text-paper-100/70'
                  }`}
                >
                  <span className="font-mono text-xs font-bold uppercase">Discreto (Una línea)</span>
                  <span className="font-sans text-xs text-paper-100/60">
                    Ocupa poco espacio; abre el listado al tocarlo (Recomendado).
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDisplayMode('card')}
                  className={`flex min-h-[44px] flex-col justify-center rounded border p-3 text-left ${
                    displayMode === 'card'
                      ? 'border-laser-500 bg-laser-500/10 text-paper-100'
                      : 'border-smoke-700/60 bg-ink-950 text-paper-100/70'
                  }`}
                >
                  <span className="font-mono text-xs font-bold uppercase">Tarjeta compacta</span>
                  <span className="font-sans text-xs text-paper-100/60">
                    Muestra un bloque con título y botón destacado.
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Agregar un regalo */}
      <section className="flex flex-col gap-4 rounded bg-ink-900 p-4 shadow-xl">
        <h2 className="font-display text-base uppercase tracking-wide text-laser-500">
          Agregar Regalo o Deseo
        </h2>

        <form onSubmit={handleAddItem} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="regalo-url" className="font-mono text-xs uppercase tracking-wider text-paper-100/70">
              Enlace / Link del regalo
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="regalo-url"
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://tienda.cl/producto/..."
                className="h-11 flex-1 rounded border border-smoke-700 bg-ink-950 px-3 font-sans text-sm text-paper-100 focus:border-laser-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleFetchPreview}
                disabled={previewLoading || !newUrl.trim()}
                className="flex min-h-[44px] items-center justify-center border border-laser-500/80 bg-ink-950 px-4 font-mono text-xs uppercase tracking-wider text-laser-500 hover:bg-laser-500/10 disabled:opacity-50"
              >
                {previewLoading ? 'Extrayendo...' : 'Cargar preview'}
              </button>
            </div>
            <span className="font-sans text-xs text-paper-100/50">
              Pega el link y toca «Cargar preview» para extraer la foto y el título automáticamente.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="regalo-title" className="font-mono text-xs uppercase tracking-wider text-paper-100/70">
                Título del regalo *
              </label>
              <input
                id="regalo-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ej: Cámara Instantánea"
                maxLength={120}
                required
                className="h-11 rounded border border-smoke-700 bg-ink-950 px-3 font-sans text-sm text-paper-100 focus:border-laser-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="regalo-price" className="font-mono text-xs uppercase tracking-wider text-paper-100/70">
                Precio estimado (opcional)
              </label>
              <input
                id="regalo-price"
                type="text"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Ej: $49.990"
                maxLength={30}
                className="h-11 rounded border border-smoke-700 bg-ink-950 px-3 font-sans text-sm text-paper-100 focus:border-laser-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="regalo-img" className="font-mono text-xs uppercase tracking-wider text-paper-100/70">
              URL de la imagen (opcional)
            </label>
            <input
              id="regalo-img"
              type="url"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              placeholder="https://.../foto.jpg"
              className="h-11 rounded border border-smoke-700 bg-ink-950 px-3 font-sans text-sm text-paper-100 focus:border-laser-500 focus:outline-none"
            />
          </div>

          {newImageUrl && (
            <div className="flex items-center gap-3 rounded bg-ink-950 p-2">
              <img
                src={newImageUrl}
                alt="Vista previa"
                className="h-16 w-16 rounded object-cover"
                onError={() => setNewImageUrl('')}
              />
              <span className="font-sans text-xs text-paper-100/60">
                Imagen extraída con éxito para el regalo.
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="regalo-notes" className="font-mono text-xs uppercase tracking-wider text-paper-100/70">
              Notas o detalles (opcional)
            </label>
            <input
              id="regalo-notes"
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Ej: Talla M, o color rosado"
              maxLength={200}
              className="h-11 rounded border border-smoke-700 bg-ink-950 px-3 font-sans text-sm text-paper-100 focus:border-laser-500 focus:outline-none"
            />
          </div>

          {formError && (
            <p className="font-sans text-xs text-hotpink-500">{formError}</p>
          )}

          <button
            type="submit"
            className="mt-2 flex min-h-[44px] items-center justify-center bg-acid-400 font-display text-xs uppercase tracking-wider text-ink-950 hover:bg-acid-300"
          >
            + Agregar a la lista
          </button>
        </form>
      </section>

      {/* Lista de regalos actuales */}
      <section className="flex flex-col gap-4 rounded bg-ink-900 p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base uppercase tracking-wide text-laser-500">
            Regalos en la Lista ({items.length}/30)
          </h2>
        </div>

        {items.length === 0 ? (
          <p className="py-4 text-center font-sans text-xs text-paper-100/50">
            Aún no has agregado ningún regalo a la lista.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded border border-smoke-700/40 bg-ink-950 p-3"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded object-cover bg-ink-900"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-ink-900 text-lg">
                      🎁
                    </div>
                  )}
                  <div className="flex flex-col truncate">
                    <span className="truncate font-sans text-sm font-bold text-paper-100">
                      {item.title}
                    </span>
                    {item.price && (
                      <span className="font-mono text-xs font-bold text-laser-500">
                        {item.price}
                      </span>
                    )}
                    {item.notes && (
                      <span className="truncate font-sans text-xs text-paper-100/60">
                        {item.notes}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center border border-smoke-700 bg-ink-900 px-2 font-mono text-xs uppercase text-paper-100 hover:border-laser-500"
                    aria-label={`Ver enlace de ${item.title}`}
                  >
                    ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center border border-hotpink-500/40 bg-ink-900 px-2 font-mono text-xs uppercase text-hotpink-500 hover:bg-hotpink-500/10"
                    aria-label={`Eliminar ${item.title}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Botón de guardar cambios */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded bg-ink-900 p-4 shadow-2xl border border-smoke-700">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex min-h-[44px] w-full items-center justify-center bg-laser-500 font-display text-sm uppercase tracking-wider text-ink-950 hover:bg-laser-400 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar lista de regalos'}
        </button>
        {saveSuccess && (
          <p className="text-center font-mono text-xs uppercase tracking-wider text-acid-400">
            ✓ Lista de regalos guardada con éxito
          </p>
        )}
        {saveError && (
          <p className="text-center font-mono text-xs uppercase tracking-wider text-hotpink-500">
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}
