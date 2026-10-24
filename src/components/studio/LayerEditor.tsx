import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  addLayer,
  createLayer,
  duplicateLayer,
  hitTest,
  layerBounds,
  moveLayer,
  removeLayer,
  reorderLayer,
  rotationFromPointer,
  scaleFactorFromPointers,
  scaleLayer,
  updateLayer,
  type NewLayerKind,
  type Point,
} from '../../lib/cameraAssets/layerOps';
import type { FrameLayer } from '../../lib/cameraAssets/layers';
import FramePreview from './FramePreview';
import LayerPanel from './LayerPanel';
import LayerProperties from './LayerProperties';

/** Tamaño del lienzo de edición en píxeles CSS. Las capas se miden relativas al lado menor (270). */
export const STAGE_WIDTH = 270;
export const STAGE_HEIGHT = 360;

interface LayerEditorProps {
  layers: FrameLayer[];
  onChange: (layers: FrameLayer[]) => void;
  /** Sube una imagen y devuelve su ruta en Storage. Sin esto no se ofrece agregar imágenes. */
  uploadImage?: (file: File) => Promise<string>;
  /** Firma la ruta de una imagen para mostrarla en el lienzo. */
  resolveImageUrl?: (path: string) => Promise<string>;
}

interface Gesture {
  kind: 'move' | 'scale' | 'rotate';
  index: number;
  start: Point;
  /** La capa tal como estaba al empezar: cada movimiento se calcula desde ahí, sin acumular error. */
  layer: FrameLayer;
}

/** Cuánto mueve una flecha (fracción del lienzo), y con Shift. */
const NUDGE = 0.01;
const NUDGE_BIG = 0.05;

/**
 * Editor visual de las capas de un marco: lienzo con la capa seleccionada
 * rodeada de asas (arrastrar mueve, la esquina escala, el círculo gira), lista
 * de capas con su orden y panel de propiedades. Funciona con puntero (ratón y
 * táctil) y con teclado (flechas mueven, Suprimir borra).
 */
export default function LayerEditor({ layers, onChange, uploadImage, resolveImageUrl }: LayerEditorProps) {
  const [selectedRaw, setSelected] = useState(-1);
  const selected = selectedRaw >= 0 && selectedRaw < layers.length ? selectedRaw : -1;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const params = useMemo(() => ({ layers }), [layers]);
  const selectedLayer = selected >= 0 ? layers[selected] : undefined;
  const isCover = selectedLayer?.type === 'image' && selectedLayer.full === true;

  const replaceSelected = (layer: FrameLayer) => onChange(layers.map((l, i) => (i === selected ? layer : l)));

  /** Coordenadas del puntero en el sistema del lienzo (por si la pantalla lo achica con CSS). */
  function toStage(e: PointerEvent<HTMLElement>): Point {
    const rect = stageRef.current?.getBoundingClientRect();
    const scale = rect && rect.width > 0 ? rect.width / STAGE_WIDTH : 1;
    return { x: (e.clientX - (rect?.left ?? 0)) / scale, y: (e.clientY - (rect?.top ?? 0)) / scale };
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button > 0) return;
    const pos = toStage(e);
    const handle = (e.target as HTMLElement).closest('[data-handle]')?.getAttribute('data-handle');

    if ((handle === 'scale' || handle === 'rotate') && selectedLayer) {
      gesture.current = { kind: handle, index: selected, start: pos, layer: selectedLayer };
    } else {
      const index = hitTest(layers, pos.x, pos.y, STAGE_WIDTH, STAGE_HEIGHT);
      setSelected(index);
      gesture.current = index >= 0 ? { kind: 'move', index, start: pos, layer: layers[index] } : null;
    }
    const stage = stageRef.current;
    if (stage && typeof stage.setPointerCapture === 'function') stage.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const pos = toStage(e);

    let next: FrameLayer;
    if (g.kind === 'move') {
      next = moveLayer(g.layer, pos.x - g.start.x, pos.y - g.start.y, STAGE_WIDTH, STAGE_HEIGHT);
    } else {
      const b = layerBounds(g.layer, STAGE_WIDTH, STAGE_HEIGHT);
      const center = { x: b.cx, y: b.cy };
      next =
        g.kind === 'scale'
          ? scaleLayer(g.layer, scaleFactorFromPointers(center, g.start, pos))
          : { ...g.layer, rotation: rotationFromPointer(center, pos) };
    }
    if (next !== g.layer) onChange(updateLayer(layersRef.current, g.index, next));
  }

  function endGesture() {
    gesture.current = null;
  }

  function confirmDelete() {
    if (selected < 0) return;
    if (!window.confirm('¿Borrar esta capa?')) return;
    const result = removeLayer(layers, selected);
    onChange(result.layers);
    setSelected(result.index);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!selectedLayer) return;
    const step = e.shiftKey ? NUDGE_BIG : NUDGE;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      replaceSelected(moveLayer(selectedLayer, move[0] * STAGE_WIDTH, move[1] * STAGE_HEIGHT, STAGE_WIDTH, STAGE_HEIGHT));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      confirmDelete();
    } else if (e.key === 'Escape') {
      setSelected(-1);
    }
  }

  function handleAdd(kind: NewLayerKind) {
    const result = addLayer(layers, createLayer(kind));
    if (result.index < 0) return;
    onChange(result.layers);
    setSelected(result.index);
  }

  async function handleUpload(file: File) {
    if (!uploadImage) return;
    setUploading(true);
    setError(null);
    try {
      const src = await uploadImage(file);
      const result = addLayer(layersRef.current, createLayer('image', { src }));
      if (result.index >= 0) {
        onChange(result.layers);
        setSelected(result.index);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos subir la imagen.');
    } finally {
      setUploading(false);
    }
  }

  const bounds = selectedLayer ? layerBounds(selectedLayer, STAGE_WIDTH, STAGE_HEIGHT) : null;

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex flex-col gap-2">
        <div
          ref={stageRef}
          role="application"
          aria-label="Lienzo del marco"
          tabIndex={0}
          style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, touchAction: 'none' }}
          className="relative shrink-0 cursor-crosshair select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-400"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onKeyDown={handleKeyDown}
        >
          <FramePreview template="capas" params={params} width={STAGE_WIDTH} height={STAGE_HEIGHT} resolveImageUrl={resolveImageUrl} label="Vista previa del marco" />
          {selectedLayer && bounds && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute outline outline-1 outline-acid-400"
              style={{
                left: bounds.cx - bounds.width / 2,
                top: bounds.cy - bounds.height / 2,
                width: bounds.width,
                height: Math.max(bounds.height, 2),
                transform: `rotate(${bounds.rotation}deg)`,
              }}
            >
              {!isCover && (
                <>
                  <span
                    data-handle="scale"
                    data-testid="handle-scale"
                    className="pointer-events-auto absolute -bottom-2.5 -right-2.5 h-5 w-5 cursor-nwse-resize bg-acid-400"
                  />
                  <span
                    data-handle="rotate"
                    data-testid="handle-rotate"
                    className="pointer-events-auto absolute -top-8 left-1/2 h-5 w-5 -translate-x-1/2 cursor-grab rounded-full bg-acid-400"
                  />
                </>
              )}
            </div>
          )}
        </div>
        <p className="max-w-[270px] font-sans text-xs text-paper-100/60">
          Toca una capa para elegirla y arrástrala. El cuadrado de la esquina cambia el tamaño; el círculo de arriba la gira. Con el teclado, las flechas
          la mueven.
        </p>
      </div>

      <div className="flex min-w-[220px] flex-1 flex-col gap-4">
        <LayerPanel
          layers={layers}
          selected={selected}
          onSelect={setSelected}
          onAdd={handleAdd}
          onUploadFile={uploadImage ? (file) => void handleUpload(file) : undefined}
          uploading={uploading}
          onReorder={(direction) => {
            const result = reorderLayer(layers, selected, direction);
            onChange(result.layers);
            setSelected(result.index);
          }}
          onDuplicate={() => {
            const result = duplicateLayer(layers, selected);
            if (result.index < 0) return;
            onChange(result.layers);
            setSelected(result.index);
          }}
          onDelete={confirmDelete}
        />
        {error && (
          <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
            {error}
          </p>
        )}
        {selectedLayer ? (
          <LayerProperties key={selected} layer={selectedLayer} onChange={replaceSelected} />
        ) : (
          layers.length > 0 && <p className="font-sans text-sm text-paper-100/70">Elige una capa para editarla.</p>
        )}
      </div>
    </div>
  );
}
