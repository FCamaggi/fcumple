import { MAX_STICKERS_PER_PHOTO } from '../../lib/cameraAssets/stickers';
import type { CameraStickerOption } from './types';

interface StickerTrayProps {
  options: CameraStickerOption[];
  count: number;
  hasSelection: boolean;
  onAdd: (option: CameraStickerOption) => void;
  onBigger: () => void;
  onSmaller: () => void;
  onRotate: () => void;
  onRemove: () => void;
}

const controlClass =
  'tap-target px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider bg-smoke-700/30 text-paper-100 disabled:opacity-40';

/**
 * Bandeja de stickers de la cámara: tocar uno lo agrega al centro de la foto
 * (hasta el máximo por foto) y los botones permiten cambiarle el tamaño,
 * girarlo o quitarlo sin necesidad de gestos.
 */
export default function StickerTray({
  options,
  count,
  hasSelection,
  onAdd,
  onBigger,
  onSmaller,
  onRotate,
  onRemove,
}: StickerTrayProps) {
  if (options.length === 0) return null;
  const full = count >= MAX_STICKERS_PER_PHOTO;

  return (
    <section className="flex flex-col gap-1.5" aria-label="Stickers">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-paper-100/60">
          Stickers // {count}/{MAX_STICKERS_PER_PHOTO}
        </span>
        {full && <span className="font-mono text-xs uppercase text-flame-500">Máximo por foto</span>}
      </div>

      <ul className="flex gap-2 overflow-x-auto pb-1">
        {options.map((option) => (
          <li key={option.id} className="shrink-0">
            <button
              type="button"
              disabled={full}
              onClick={() => onAdd(option)}
              aria-label={`Agregar sticker ${option.label}`}
              className="tap-target flex h-11 w-11 items-center justify-center bg-smoke-700/30 text-2xl disabled:opacity-40"
            >
              {option.asset.kind === 'emoji' ? (
                <span aria-hidden>{option.asset.emoji}</span>
              ) : (
                <img src={option.previewSrc} alt="" draggable={false} className="h-8 w-8 object-contain" />
              )}
            </button>
          </li>
        ))}
      </ul>

      {hasSelection && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sticker seleccionado">
          <button type="button" className={controlClass} onClick={onBigger}>
            Más grande
          </button>
          <button type="button" className={controlClass} onClick={onSmaller}>
            Más chico
          </button>
          <button type="button" className={controlClass} onClick={onRotate}>
            Girar
          </button>
          <button type="button" className={`${controlClass} text-flame-500`} onClick={onRemove}>
            Quitar
          </button>
        </div>
      )}
    </section>
  );
}
