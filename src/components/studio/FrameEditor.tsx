import { useMemo, useState } from 'react';
import {
  FONT_LABELS,
  FRAME_FONTS,
  MAX_TEXT_LENGTH,
  TEMPLATE_FIELDS,
  TEMPLATE_LABELS,
  validateFrameParams,
  type FrameField,
  type FrameFont,
  type FrameParams,
  type FrameTemplate,
} from '../../lib/cameraAssets/frames';
import FramePreview from './FramePreview';
import LayerEditor from './LayerEditor';

interface FrameEditorProps {
  template: FrameTemplate;
  initialLabel: string;
  initialParams: FrameParams;
  saving?: boolean;
  onSave: (label: string, params: FrameParams) => void;
  onCancel: () => void;
  /** Solo la plantilla `capas`: sube una imagen y devuelve su ruta en Storage. */
  uploadImage?: (file: File) => Promise<string>;
  /** Solo la plantilla `capas`: firma la ruta de una imagen para mostrarla. */
  resolveImageUrl?: (path: string) => Promise<string>;
}

const SWATCHES = ['#ff4fa3', '#ff7a45', '#f5d36b', '#3ddc97', '#4fc3ff', '#9b6bff', '#ffffff', '#111111'];

const FIELD_LABELS: Record<FrameField, string> = {
  primaryColor: 'Color principal',
  secondaryColor: 'Color secundario',
  textColor: 'Color del texto',
  title: 'Título',
  subtitle: 'Subtítulo',
  caption: 'Leyenda',
  font: 'Tipografía',
  thickness: 'Grosor',
  radius: 'Redondeo',
  position: 'Posición',
  layers: 'Capas',
};

const inputClass = 'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none';
const labelClass = 'font-mono text-[11px] uppercase tracking-wider text-paper-100/70';

/** Rango práctico de los controles deslizantes (la base acepta de 0 a 1). */
const SLIDER_MAX: Partial<Record<FrameField, number>> = { thickness: 0.3, radius: 0.2 };

/**
 * FrameEditor — edita los colores, textos y tipografía de un marco con vista
 * previa en vivo. Solo muestra los controles que la plantilla usa.
 */
export default function FrameEditor({
  template,
  initialLabel,
  initialParams,
  saving,
  onSave,
  onCancel,
  uploadImage,
  resolveImageUrl,
}: FrameEditorProps) {
  const [label, setLabel] = useState(initialLabel);
  const [params, setParams] = useState<FrameParams>(initialParams);
  const [error, setError] = useState<string | null>(null);

  const fields = TEMPLATE_FIELDS[template];

  // Los textos vacíos no se guardan: así el marco no dibuja una leyenda en blanco.
  const cleaned = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.trim() === '') continue;
      out[key] = typeof value === 'string' && ['title', 'subtitle', 'caption'].includes(key) ? value.trim() : value;
    }
    return out as FrameParams;
  }, [params]);

  function set<K extends keyof FrameParams>(key: K, value: FrameParams[K]) {
    setParams((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError('Ponle un nombre al marco.');
      return;
    }
    const valid = validateFrameParams(cleaned);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    onSave(label.trim(), cleaned);
  }

  function colorField(key: 'primaryColor' | 'secondaryColor' | 'textColor') {
    const value = params[key] ?? '#000000';
    return (
      <div key={key} className="flex flex-col gap-1">
        <label htmlFor={`field-${key}`} className={labelClass}>
          {FIELD_LABELS[key]}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`field-${key}`}
            type="color"
            value={value}
            onChange={(e) => set(key, e.target.value)}
            className="h-9 w-12 cursor-pointer bg-transparent"
          />
          <div className="flex flex-wrap gap-1" role="group" aria-label={`Colores sugeridos para ${FIELD_LABELS[key].toLowerCase()}`}>
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`${FIELD_LABELS[key]} ${swatch}`}
                onClick={() => set(key, swatch)}
                style={{ backgroundColor: swatch }}
                className={`h-6 w-6 border ${value.toLowerCase() === swatch ? 'border-acid-400' : 'border-smoke-700/60'}`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  function textField(key: 'title' | 'subtitle' | 'caption') {
    return (
      <div key={key} className="flex flex-col gap-1">
        <label htmlFor={`field-${key}`} className={labelClass}>
          {FIELD_LABELS[key]}
        </label>
        <input
          id={`field-${key}`}
          maxLength={MAX_TEXT_LENGTH}
          value={params[key] ?? ''}
          onChange={(e) => set(key, e.target.value)}
          className={inputClass}
        />
      </div>
    );
  }

  function renderField(field: FrameField) {
    switch (field) {
      case 'primaryColor':
      case 'secondaryColor':
      case 'textColor':
        return colorField(field);
      case 'title':
      case 'subtitle':
      case 'caption':
        return textField(field);
      case 'font':
        return (
          <div key={field} className="flex flex-col gap-1">
            <label htmlFor="field-font" className={labelClass}>
              {FIELD_LABELS.font}
            </label>
            <select
              id="field-font"
              value={params.font ?? 'sans'}
              onChange={(e) => set('font', e.target.value as FrameFont)}
              className={inputClass}
            >
              {FRAME_FONTS.map((font) => (
                <option key={font} value={font}>
                  {FONT_LABELS[font]}
                </option>
              ))}
            </select>
          </div>
        );
      case 'thickness':
      case 'radius': {
        const max = SLIDER_MAX[field] ?? 1;
        return (
          <div key={field} className="flex flex-col gap-1">
            <label htmlFor={`field-${field}`} className={labelClass}>
              {FIELD_LABELS[field]}
            </label>
            <input
              id={`field-${field}`}
              type="range"
              min={0}
              max={max}
              step={0.005}
              value={Math.min(params[field] ?? 0, max)}
              onChange={(e) => set(field, Number(e.target.value))}
            />
          </div>
        );
      }
      case 'position':
        return (
          <div key={field} className="flex flex-col gap-1">
            <label htmlFor="field-position" className={labelClass}>
              {FIELD_LABELS.position}
            </label>
            <select
              id="field-position"
              value={params.position ?? 'bottom'}
              onChange={(e) => set('position', e.target.value as 'top' | 'bottom')}
              className={inputClass}
            >
              <option value="top">Arriba</option>
              <option value="bottom">Abajo</option>
            </select>
          </div>
        );
      case 'layers':
        return (
          <LayerEditor
            key={field}
            layers={params.layers ?? []}
            onChange={(layers) => set('layers', layers)}
            uploadImage={uploadImage}
            resolveImageUrl={resolveImageUrl}
          />
        );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-label={`Editar marco ${TEMPLATE_LABELS[template]}`}>
      <div className="flex flex-wrap gap-4">
        {/* Las capas traen su propio lienzo de edición, que ya es la vista previa. */}
        {template !== 'capas' && <FramePreview template={template} params={cleaned} width={180} height={240} />}

        <div className="flex min-w-[220px] flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="frame-label" className={labelClass}>
              Nombre del marco ({TEMPLATE_LABELS[template]})
            </label>
            <input
              id="frame-label"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              className={inputClass}
            />
          </div>
          {fields.map(renderField)}
        </div>
      </div>

      {error && (
        <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
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
          className="h-10 border border-smoke-700/60 px-5 font-mono text-[11px] uppercase tracking-wider text-paper-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
