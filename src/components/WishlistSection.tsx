import { useState } from 'react';
import type { WishlistConfig, WishlistItem } from '../lib/wishlist';

interface WishlistSectionProps {
  wishlist?: WishlistConfig;
}

/**
 * WishlistSection — lo que ve el invitado en la cartelera (/e/:slug).
 *
 * Requisito de producto: dado que es información accesoria, NO debe consumir
 * mucho espacio en la cartelera. Por defecto se presenta como un chip / botón
 * compacto de una línea que no invade el rollo de fotos. Al tocarlo abre un
 * diálogo / modal accesible con los regalos y sus enlaces.
 */
export default function WishlistSection({ wishlist }: WishlistSectionProps) {
  const [open, setOpen] = useState(false);

  if (!wishlist || !wishlist.enabled || wishlist.items.length === 0) {
    return null;
  }

  const title = wishlist.title || 'Lista de regalos';
  const count = wishlist.items.length;

  return (
    <>
      <section aria-label="Lista de regalos del evento" className="w-full">
        {wishlist.displayMode === 'card' ? (
          <div className="flex flex-col gap-2 rounded bg-ink-900 p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-laser-500">
                🎁 {title}
              </span>
              <span className="font-mono text-xs text-paper-100/60">
                {count} {count === 1 ? 'deseo' : 'deseos'}
              </span>
            </div>
            <p className="font-sans text-xs text-paper-100/70">
              Ideas y regalos sugeridos para la fiesta.
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-1 flex min-h-[44px] w-full items-center justify-center border border-laser-500/80 bg-ink-950 px-4 font-mono text-xs uppercase tracking-wider text-laser-500 hover:bg-laser-500/10"
            >
              Ver regalos sugeridos →
            </button>
          </div>
        ) : (
          /* Modo chip / banner: discreto, ocupa una sola línea */
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-[44px] w-full items-center justify-between border border-laser-500/60 bg-ink-900/90 px-4 py-2 text-left shadow-lg transition-colors hover:border-laser-500"
          >
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-base">🎁</span>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-paper-100">
                {title}
              </span>
            </div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-laser-500">
              {count} {count === 1 ? 'ítem' : 'ítems'} →
            </span>
          </button>
        )}
      </section>

      {open && <WishlistModal wishlist={wishlist} onClose={() => setOpen(false)} />}
    </>
  );
}

function WishlistModal({
  wishlist,
  onClose,
}: {
  wishlist: WishlistConfig;
  onClose: () => void;
}) {
  const title = wishlist.title || 'Lista de regalos';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-safe z-50 flex items-end justify-center bg-ink-950/80 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-xl bg-ink-900 p-5 shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between border-b border-smoke-700/40 pb-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-xl">🎁</span>
            <h2 className="font-display text-lg uppercase tracking-wide text-paper-100">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center font-mono text-sm text-paper-100/60 hover:text-paper-100"
            aria-label="Cerrar lista de regalos"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto py-4">
          <p className="mb-4 font-sans text-xs text-paper-100/60">
            Ideas y enlaces de regalo para la fiesta. Toca cualquier ítem para abrir su tienda:
          </p>
          <ul className="flex flex-col gap-3">
            {wishlist.items.map((item) => (
              <WishlistItemRow key={item.id} item={item} />
            ))}
          </ul>
        </div>

        <footer className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] w-full items-center justify-center bg-laser-500 font-display text-xs uppercase tracking-wider text-ink-950"
          >
            Listo
          </button>
        </footer>
      </div>
    </div>
  );
}

function WishlistItemRow({ item }: { item: WishlistItem }) {
  const [imgError, setImgError] = useState(false);

  return (
    <li className="flex items-center gap-3 rounded border border-smoke-700/40 bg-ink-950 p-3">
      {item.imageUrl && !imgError ? (
        <img
          src={item.imageUrl}
          alt=""
          onError={() => setImgError(true)}
          className="h-16 w-16 shrink-0 rounded object-cover bg-ink-900"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-ink-900 text-2xl text-paper-100/40"
        >
          🎁
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <h3 className="line-clamp-2 font-sans text-sm font-bold text-paper-100">
          {item.title}
        </h3>
        {item.price && (
          <span className="font-mono text-xs font-bold text-laser-500">
            {item.price}
          </span>
        )}
        {item.notes && (
          <p className="line-clamp-2 font-sans text-xs text-paper-100/60">
            {item.notes}
          </p>
        )}
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center border border-smoke-700 bg-ink-900 px-3 font-mono text-xs uppercase tracking-wider text-paper-100 hover:border-laser-500 hover:text-laser-500"
        aria-label={`Ver ${item.title}`}
      >
        Ver ↗
      </a>
    </li>
  );
}
