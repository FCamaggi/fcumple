import { useRef } from 'react';
import { MAX_LAYERS, type FrameLayer } from '../../lib/cameraAssets/layers';
import type { NewLayerKind } from '../../lib/cameraAssets/layerOps';

interface LayerPanelProps {
  layers: FrameLayer[];
  /** -1 si no hay ninguna seleccionada. */
  selected: number;
  onSelect: (index: number) => void;
  onAdd: (kind: NewLayerKind) => void;
  /** Sin esto no se ofrece agregar imágenes. */
  onUploadFile?: (file: File) => void;
  uploading?: boolean;
  onReorder: (direction: 'up' | 'down') => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const ADD_BUTTONS: Array<{ kind: NewLayerKind; label: string; short: string }> = [
  { kind: 'text', label: 'Agregar texto', short: 'Texto' },
  { kind: 'rect', label: 'Agregar rectángulo', short: 'Rectángulo' },
  { kind: 'ellipse', label: 'Agregar elipse', short: 'Elipse' },
  { kind: 'line', label: 'Agregar línea', short: 'Línea' },
  { kind: 'path', label: 'Agregar corazón', short: 'Corazón' },
  { kind: 'emoji', label: 'Agregar emoji', short: 'Emoji' },
];

const smallButton =
  'h-8 min-w-11 border border-smoke-700/60 px-3 font-mono text-xs uppercase tracking-wider text-paper-100 disabled:opacity-40';

/** Nombre corto de una capa para la lista. */
export function layerSummary(layer: FrameLayer): string {
  switch (layer.type) {
    case 'text':
      return `Texto: ${layer.text}`;
    case 'emoji':
      return `Emoji ${layer.emoji}`;
    case 'image':
      return layer.full ? 'Imagen a pantalla completa' : 'Imagen';
    case 'shape':
      return { rect: 'Rectángulo', ellipse: 'Elipse', line: 'Línea', path: 'Trazo' }[layer.shape];
    case 'asset': {
      const name = layer.asset.split('/')[1] ?? layer.asset;
      return `Recurso: ${name}`;
    }
  }
}

/** Lista de capas (la primera queda al fondo), botonera para agregar y acciones sobre la seleccionada. */
export default function LayerPanel({
  layers,
  selected,
  onSelect,
  onAdd,
  onUploadFile,
  uploading,
  onReorder,
  onDuplicate,
  onDelete,
}: LayerPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const atLimit = layers.length >= MAX_LAYERS;
  const hasSelection = selected >= 0 && selected < layers.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Agregar capa">
        {ADD_BUTTONS.map(({ kind, label, short }) => (
          <button key={kind} type="button" aria-label={label} disabled={atLimit} onClick={() => onAdd(kind)} className={smallButton}>
            + {short}
          </button>
        ))}
        {onUploadFile && (
          <>
            <button type="button" disabled={atLimit || uploading} onClick={() => fileRef.current?.click()} className={smallButton}>
              {uploading ? 'Subiendo...' : '+ Imagen'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              hidden
              aria-label="Elegir imagen"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onUploadFile(file);
              }}
            />
          </>
        )}
      </div>
      {atLimit && <p className="font-sans text-xs text-paper-100/70">Llegaste al máximo de {MAX_LAYERS} capas.</p>}

      {layers.length === 0 ? (
        <p className="font-sans text-sm text-paper-100/70">Sin capas todavía. Agrega un texto, una forma o una imagen.</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Capas del marco">
          {layers.map((layer, index) => (
            <li key={index}>
              <button
                type="button"
                aria-current={index === selected ? 'true' : undefined}
                onClick={() => onSelect(index)}
                className={`w-full truncate px-3 py-2 text-left font-sans text-sm text-paper-100 ${
                  index === selected ? 'bg-acid-400/20 outline outline-1 outline-acid-400' : 'bg-ink-900'
                }`}
              >
                {index + 1}. {layerSummary(layer)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1" role="group" aria-label="Acciones sobre la capa">
        <button type="button" className={smallButton} disabled={!hasSelection || selected >= layers.length - 1} onClick={() => onReorder('up')} aria-label="Subir capa">
          ↑ Subir
        </button>
        <button type="button" className={smallButton} disabled={!hasSelection || selected <= 0} onClick={() => onReorder('down')} aria-label="Bajar capa">
          ↓ Bajar
        </button>
        <button type="button" className={smallButton} disabled={!hasSelection || atLimit} onClick={onDuplicate} aria-label="Duplicar capa">
          Duplicar
        </button>
        <button type="button" className={smallButton} disabled={!hasSelection} onClick={onDelete} aria-label="Borrar capa">
          Borrar
        </button>
      </div>
    </div>
  );
}
