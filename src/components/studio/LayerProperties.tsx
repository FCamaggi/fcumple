import { useState } from 'react';
import { LAYER_ANCHORS, type FrameLayer, type LayerAnchor, type LayerShadow } from '../../lib/cameraAssets/layers';
import { isSingleEmoji } from '../../lib/cameraAssets/stickers';
import { fontOptionLabel, fontsOffered, type LayerFont } from '../../lib/cameraAssets/text';

interface LayerPropertiesProps {
  layer: FrameLayer;
  onChange: (layer: FrameLayer) => void;
}

const SWATCHES = ['#ff4fa3', '#111111', '#ffffff', '#f5d36b', '#4fc3ff', '#9b6bff'];
const DEFAULT_SHADOW: LayerShadow = { color: '#000000', blur: 0.02, x: 0.01, y: 0.01 };

const ANCHOR_LABELS: Record<LayerAnchor, string> = {
  center: 'Centro',
  tl: 'Esquina superior izquierda',
  tr: 'Esquina superior derecha',
  bl: 'Esquina inferior izquierda',
  br: 'Esquina inferior derecha',
};

const inputClass = 'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none';
const labelClass = 'font-mono text-xs uppercase tracking-wider text-paper-100/70';

/** Copia de la capa sin una clave opcional (`undefined` no es lo mismo que ausente para la validación). */
function without<K extends string>(layer: FrameLayer, key: K): FrameLayer {
  const copy = { ...layer } as Record<string, unknown>;
  delete copy[key];
  return copy as unknown as FrameLayer;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`prop-${label}`} className={labelClass}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1">
        <input
          id={`prop-${label}`}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 border border-smoke-700/60 bg-ink-950"
        />
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`${label} ${swatch}`}
            onClick={() => onChange(swatch)}
            style={{ backgroundColor: swatch }}
            data-compact
                className={`h-8 w-8 border ${value.toLowerCase() === swatch ? 'border-acid-400' : 'border-smoke-700/60'}`}
          />
        ))}
      </div>
    </div>
  );
}

function RangeField(props: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const { label, value, min, max, step, onChange } = props;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`prop-${label}`} className={labelClass}>
        {label}
      </label>
      <input
        id={`prop-${label}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(Math.max(value, min), max)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * Campo de texto que solo confirma valores válidos: mientras se escribe puede
 * quedar vacío sin que la capa deje de ser válida (la capa conserva el último valor bueno).
 */
function DraftField(props: {
  label: string;
  value: string;
  maxLength: number;
  validate: (value: string) => string | null;
  onCommit: (value: string) => void;
}) {
  const { label, value, maxLength, validate, onCommit } = props;
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`prop-${label}`} className={labelClass}>
        {label}
      </label>
      <input
        id={`prop-${label}`}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (next === '') return setError(null);
          const problem = validate(next);
          setError(problem);
          if (!problem) onCommit(next);
        }}
        className={inputClass}
      />
      {error && (
        <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}
    </div>
  );
}

function CommonFields({ layer, onChange }: LayerPropertiesProps) {
  // Rotación y ancla no valen para una imagen a pantalla completa ni para una forma pegada a los bordes.
  const cover = (layer.type === 'image' && layer.full === true) || (layer.type === 'shape' && layer.box !== undefined);
  return (
    <>
      <RangeField label="Opacidad" value={layer.opacity ?? 1} min={0} max={1} step={0.05} onChange={(opacity) => onChange({ ...layer, opacity })} />
      <label className="flex items-center gap-2 font-sans text-sm text-paper-100">
        <input
          type="checkbox"
          checked={layer.locked === true}
          onChange={(e) => onChange(e.target.checked ? { ...layer, locked: true } : without(layer, 'locked'))}
        />
        Bloquear capa
      </label>
      {!cover && (
        <>
          <RangeField label="Rotación" value={layer.rotation ?? 0} min={-180} max={180} step={1} onChange={(rotation) => onChange({ ...layer, rotation })} />
          <div className="flex flex-col gap-1">
            <label htmlFor="prop-Ancla" className={labelClass}>
              Ancla
            </label>
            <select
              id="prop-Ancla"
              value={layer.anchor ?? 'center'}
              onChange={(e) => onChange({ ...layer, anchor: e.target.value as LayerAnchor })}
              className={inputClass}
            >
              {LAYER_ANCHORS.map((anchor) => (
                <option key={anchor} value={anchor}>
                  {ANCHOR_LABELS[anchor]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 font-sans text-sm text-paper-100">
            <input
              type="checkbox"
              checked={layer.shadow !== undefined}
              onChange={(e) => onChange(e.target.checked ? { ...layer, shadow: DEFAULT_SHADOW } : without(layer, 'shadow'))}
            />
            Sombra
          </label>
        </>
      )}
    </>
  );
}

/** Controles de la capa seleccionada, según su tipo. Cada cambio devuelve la capa completa. */
export default function LayerProperties({ layer, onChange }: LayerPropertiesProps) {
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Propiedades de la capa">
      {layer.type === 'text' && (
        <>
          <DraftField
            label="Texto"
            value={layer.text}
            maxLength={60}
            validate={(v) => (v.trim() === '' ? 'Escribe algo.' : null)}
            onCommit={(text) => onChange({ ...layer, text })}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="prop-Tipografía" className={labelClass}>
              Tipografía
            </label>
            <select
              id="prop-Tipografía"
              value={layer.font ?? 'sans'}
              onChange={(e) => onChange({ ...layer, font: e.target.value as LayerFont })}
              className={inputClass}
            >
              {fontsOffered(layer.font ?? 'sans').map((font) => (
                <option key={font} value={font}>
                  {fontOptionLabel(font)}
                </option>
              ))}
            </select>
          </div>
          <ColorField label="Color del texto" value={layer.color ?? '#ffffff'} onChange={(color) => onChange({ ...layer, color })} />
          <RangeField label="Tamaño" value={layer.size ?? 0.06} min={0.02} max={0.4} step={0.005} onChange={(size) => onChange({ ...layer, size })} />
          <label className="flex items-center gap-2 font-sans text-sm text-paper-100">
            <input
              type="checkbox"
              checked={layer.weight === 'bold'}
              onChange={(e) => onChange({ ...layer, weight: e.target.checked ? 'bold' : 'normal' })}
            />
            Negrita
          </label>
          <ColorField label="Color del contorno" value={layer.strokeColor ?? '#111111'} onChange={(strokeColor) => onChange({ ...layer, strokeColor, strokeWidth: layer.strokeWidth ?? 0.008 })} />
          <RangeField label="Grosor del contorno" value={layer.strokeWidth ?? 0} min={0} max={0.05} step={0.002} onChange={(strokeWidth) => onChange({ ...layer, strokeWidth })} />
        </>
      )}

      {layer.type === 'shape' && (
        <>
          {layer.shape !== 'line' && (
            <>
              <label className="flex items-center gap-2 font-sans text-sm text-paper-100">
                <input
                  type="checkbox"
                  checked={layer.fill === undefined}
                  onChange={(e) =>
                    onChange(e.target.checked ? ({ ...without(layer, 'fill'), stroke: layer.stroke ?? '#ffffff' } as FrameLayer) : { ...layer, fill: '#ff4fa3' })
                  }
                />
                Sin relleno
              </label>
              {layer.fill !== undefined && <ColorField label="Relleno" value={layer.fill} onChange={(fill) => onChange({ ...layer, fill })} />}
            </>
          )}
          <ColorField label="Color del borde" value={layer.stroke ?? '#ffffff'} onChange={(stroke) => onChange({ ...layer, stroke, strokeWidth: layer.strokeWidth ?? 0.01 })} />
          <RangeField label="Grosor del borde" value={layer.strokeWidth ?? 0.01} min={0} max={0.1} step={0.005} onChange={(strokeWidth) => onChange({ ...layer, strokeWidth })} />
          {layer.shape === 'rect' && (
            <RangeField label="Redondeo" value={layer.radius ?? 0} min={0} max={0.5} step={0.01} onChange={(radius) => onChange({ ...layer, radius })} />
          )}
        </>
      )}

      {layer.type === 'emoji' && (
        <>
          <DraftField
            label="Emoji"
            value={layer.emoji}
            maxLength={32}
            validate={(v) => (isSingleEmoji(v) ? null : 'Escribe o pega un solo emoji.')}
            onCommit={(emoji) => onChange({ ...layer, emoji })}
          />
          <RangeField label="Tamaño" value={layer.size ?? 0.1} min={0.03} max={0.6} step={0.01} onChange={(size) => onChange({ ...layer, size })} />
        </>
      )}

      {layer.type === 'image' && (
        <label className="flex items-center gap-2 font-sans text-sm text-paper-100">
          <input
            type="checkbox"
            checked={layer.full === true}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { ...layer, full: true }
                  : ({ ...without(layer, 'full'), w: layer.w ?? 0.5, h: layer.h ?? 0.5, x: layer.x ?? 0.5, y: layer.y ?? 0.5 } as FrameLayer),
              )
            }
          />
          Cubrir toda la foto
        </label>
      )}

      {layer.type === 'asset' && (
        <ColorField
          label="Color del recurso"
          value={layer.tint ?? '#ff2f92'}
          onChange={(tint) => onChange({ ...layer, tint })}
        />
      )}

      <CommonFields layer={layer} onChange={onChange} />
    </div>
  );
}
