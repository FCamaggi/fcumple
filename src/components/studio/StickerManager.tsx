import { useEffect, useRef, useState } from 'react';
import { isSingleEmoji } from '../../lib/cameraAssets/stickers';
import { getStickerPreviewUrl, type EventSticker } from '../../lib/cameraStudioApi';

interface StickerManagerProps {
  stickers: EventSticker[];
  onAddEmoji: (emoji: string) => Promise<void>;
  onAddImage: (file: File) => Promise<void>;
  onToggle: (sticker: EventSticker, enabled: boolean) => Promise<void>;
  onDelete: (sticker: EventSticker) => Promise<void>;
  /** Sin agregar ni borrar: solo ver y activar o apagar (el celular no edita diseños). */
  readOnly?: boolean;
}

/** Emojis festivos para agregar con un toque. Cualquier otro se pega en el campo de abajo. */
export const EMOJI_PALETTE = [
  '🎉', '🎊', '🥳', '🎂', '🍰', '🧁', '🍾', '🥂', '🍻', '🍕', '🍔', '🌮',
  '❤️', '😍', '😎', '🤩', '😂', '🥹', '😜', '🤪', '👏', '🙌', '💃', '🕺',
  '📸', '🎈', '🎁', '🎶', '🎤', '🎧', '✨', '🔥', '🌟', '💫', '🌈', '🦄',
  '👑', '💎', '🪩', '🎸', '🥁', '🏆', '⚽', '🌴', '☀️', '🌙', '🐶', '🐱',
];

/**
 * StickerManager — los stickers del evento: emojis (con un selector festivo o
 * pegando cualquiera, se ven con el estilo del teléfono de cada invitado) e
 * imágenes propias. Cada uno se puede activar o desactivar sin borrarlo.
 */
export default function StickerManager({ stickers, onAddEmoji, onAddImage, onToggle, onDelete, readOnly = false }: StickerManagerProps) {
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // URLs firmadas para mostrar las imágenes en el panel.
  useEffect(() => {
    let active = true;
    const missing = stickers.filter((s) => s.storagePath && !previews[s.storagePath]);
    for (const sticker of missing) {
      getStickerPreviewUrl(sticker.storagePath as string).then((url) => {
        if (active && url) setPreviews((current) => ({ ...current, [sticker.storagePath as string]: url }));
      });
    }
    return () => {
      active = false;
    };
  }, [stickers, previews]);

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos hacer el cambio.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!isSingleEmoji(custom)) {
      setError('Escribe o pega un solo emoji.');
      return;
    }
    await run(async () => {
      await onAddEmoji(custom.trim());
      setCustom('');
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await run(() => onAddImage(file));
  }

  const alreadyHas = (emoji: string) => stickers.some((s) => s.emoji === emoji);

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}

      {!readOnly && (
        <>
          <section className="flex flex-col gap-2" aria-label="Agregar emoji">
            <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-laser-500">Emojis</h3>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_PALETTE.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={busy || alreadyHas(emoji)}
                  onClick={() => void run(() => onAddEmoji(emoji))}
                  aria-label={`Agregar ${emoji}`}
                  className="h-11 w-11 bg-ink-900 text-xl disabled:opacity-30"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <form onSubmit={handleCustom} className="flex gap-2">
              <label htmlFor="custom-emoji" className="sr-only">
                Otro emoji
              </label>
              <input
                id="custom-emoji"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Pega cualquier emoji"
                className="w-48 bg-ink-900 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
              />
              <button
                type="submit"
                disabled={busy || !custom.trim()}
                className="h-10 border border-acid-400 px-4 font-mono text-xs uppercase tracking-wider text-acid-400 disabled:opacity-40"
              >
                Agregar
              </button>
            </form>
          </section>

          <section className="flex flex-col gap-2" aria-label="Agregar imagen">
            <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-laser-500">Imágenes propias</h3>
            <p className="font-sans text-xs text-paper-100/60">
              PNG, WebP o JPG (mejor con fondo transparente). Se reducen a 512 px automáticamente.
            </p>
            <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={handleFile} aria-label="Elegir imagen" />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="h-10 w-fit bg-acid-400 px-4 font-display text-xs uppercase tracking-wider text-ink-950 disabled:opacity-60"
            >
              {busy ? 'Subiendo...' : 'Subir imagen'}
            </button>
          </section>
        </>
      )}

      <section className="flex flex-col gap-2" aria-label="Stickers del evento">
        <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-hotpink-500">
          En la cámara ({stickers.filter((s) => s.enabled).length} activos de {stickers.length})
        </h3>
        {stickers.length === 0 ? (
          <p className="font-sans text-sm text-paper-100/60">
            {readOnly ? 'Todavía no hay stickers.' : 'Todavía no hay stickers. Agrega algunos arriba.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {stickers.map((sticker) => {
              const name = sticker.kind === 'emoji' ? (sticker.emoji as string) : 'imagen';
              return (
                <li key={sticker.id} className="flex items-center justify-between gap-2 bg-ink-900 px-3 py-2">
                  <span className="flex items-center gap-3">
                    {sticker.kind === 'emoji' ? (
                      <span className="text-2xl" aria-hidden>
                        {sticker.emoji}
                      </span>
                    ) : previews[sticker.storagePath as string] ? (
                      <img src={previews[sticker.storagePath as string]} alt="" className="h-8 w-8 object-contain" />
                    ) : (
                      <span className="h-8 w-8 bg-smoke-700/30" aria-hidden />
                    )}
                    <label className="flex min-h-11 items-center gap-2 font-sans text-sm text-paper-100">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={sticker.enabled}
                        disabled={busy}
                        aria-label={`Activo: ${name}`}
                        onChange={(e) => void run(() => onToggle(sticker, e.target.checked))}
                      />
                      {sticker.enabled ? 'Activo' : 'Apagado'}
                    </label>
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('¿Borrar este sticker?')) void run(() => onDelete(sticker));
                      }}
                      aria-label={`Borrar ${name}`}
                      className="h-8 border border-smoke-700/60 px-3 font-mono text-xs uppercase tracking-wider text-paper-100 disabled:opacity-40"
                    >
                      Borrar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
