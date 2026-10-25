import { useState } from 'react';
import { validateFrameParams, type FrameParams, type FrameTemplate } from '../../lib/cameraAssets/frames';
import LayerEditor from './LayerEditor';

interface FrameEditorProps {
  template: FrameTemplate;
  initialLabel: string;
  initialParams: FrameParams;
  saving?: boolean;
  onSave: (label: string, params: FrameParams) => void;
  onCancel: () => void;
  /** Slug del evento activo para cargar paquetes privados del evento. */
  eventSlug?: string;
  /** Sube una imagen y devuelve su ruta en Storage. */
  uploadImage?: (file: File) => Promise<string>;
  /** Firma la ruta de una imagen para mostrarla. */
  resolveImageUrl?: (path: string) => Promise<string>;
}

const inputClass = 'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none';
const labelClass = 'font-mono text-xs uppercase tracking-wider text-paper-100/70';

/**
 * FrameEditor — nombre del marco y estudio de capas. El lienzo del estudio es
 * a la vez la vista previa.
 */
export default function FrameEditor({
  template,
  initialLabel,
  initialParams,
  saving,
  onSave,
  onCancel,
  eventSlug,
  uploadImage,
  resolveImageUrl,
}: FrameEditorProps) {
  const [label, setLabel] = useState(initialLabel);
  const [params, setParams] = useState<FrameParams>(initialParams);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError('Ponle un nombre al marco.');
      return;
    }
    const valid = validateFrameParams(params);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    onSave(label.trim(), params);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-label="Editar marco">
      <div className="flex flex-col gap-1">
        <label htmlFor="frame-label" className={labelClass}>
          Nombre del marco
        </label>
        <input
          id="frame-label"
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
          className={`${inputClass} max-w-md`}
        />
      </div>

      <LayerEditor
        layers={params.layers ?? []}
        onChange={(layers) => setParams((current) => ({ ...current, layers }))}
        eventSlug={eventSlug}
        uploadImage={uploadImage}
        resolveImageUrl={resolveImageUrl}
      />

      {error && (
        <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="h-10 bg-acid-400 px-5 font-display text-xs uppercase tracking-wider text-ink-950 disabled:opacity-60"
        >
          {saving ? 'Guardando...' : 'Guardar marco'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 border border-smoke-700/60 px-5 font-mono text-xs uppercase tracking-wider text-paper-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
