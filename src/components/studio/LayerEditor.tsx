import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useLayerAssets } from '../../hooks/useLayerAssets';
import {
  ASPECT_RATIOS,
  ASPECT_RATIO_DIMENSIONS,
  applyKonvaNodeTransform,
  type CanvasAspectRatio,
} from '../../lib/cameraAssets/konvaParity';
import {
  addLayer,
  createLayer,
  duplicateLayer,
  hitTest,
  isBoxed,
  isLocked,
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
import { MAX_LAYERS, type FrameLayer } from '../../lib/cameraAssets/layers';
import {
  DEFAULT_PACK_PALETTE,
  PALETTE_PRESETS,
  getCachedPacksForEvent,
  loadPacksForEvent,
  materializePresetLayers,
  recolorLayersByPalette,
  type PackAssetCategory,
  type PackManifest,
  type PackPalette,
  type PackPreset,
} from '../../lib/cameraAssets/packs';
import FramePreview from './FramePreview';
import LayerPanel from './LayerPanel';
import LayerProperties from './LayerProperties';

const LazyKonvaCanvasStage = lazy(() => import('./KonvaCanvasStage'));

/** Tamaño base del lienzo de edición (3:4 vertical) en píxeles CSS. Las capas se miden relativas al lado menor (270). */
export const STAGE_WIDTH = 270;
export const STAGE_HEIGHT = 360;

type LibraryTab = 'presets' | 'elementos' | 'texto' | 'subidas';

interface LayerEditorProps {
  layers: FrameLayer[];
  onChange: (layers: FrameLayer[]) => void;
  /** Slug del evento activo para cargar paquetes privados además de los públicos. */
  eventSlug?: string;
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

const CATEGORY_FILTERS: Array<{ id: 'all' | PackAssetCategory; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'ilustracion', label: 'Ilustraciones' },
  { id: 'marco', label: 'Marcos' },
  { id: 'sello', label: 'Sellos' },
];

const smallToolbarBtn =
  'h-8 border border-smoke-700/60 px-2.5 font-mono text-xs uppercase tracking-wider text-paper-100 disabled:opacity-40';

/**
 * Estudio de Diseño de 3 columnas (solo escritorio >= 1024px):
 * - Izquierda: Biblioteca con pestañas Presets, Elementos (búsqueda y filtro por categoría), Texto y Subidas.
 * - Centro: Barra de herramientas (conmutador de proporción 3:4 / 4:3 / 9:16 / 1:1, Undo/Redo, guía de caras) + Lienzo Konva.
 * - Derecha: Selector de paleta por roles ($acento, $fondo, $texto), lista de capas y propiedades de la capa seleccionada.
 */
export default function LayerEditor({
  layers,
  onChange,
  eventSlug,
  uploadImage,
  resolveImageUrl,
}: LayerEditorProps) {
  const [selectedRaw, setSelected] = useState(-1);
  const selected = selectedRaw >= 0 && selectedRaw < layers.length ? selectedRaw : -1;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del Estudio (pestaña de biblioteca, búsqueda, categoría, proporción, paleta, guía e historial Undo/Redo)
  const [activeTab, setActiveTab] = useState<LibraryTab>('presets');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PackAssetCategory>('all');
  const [aspectRatio, setAspectRatio] = useState<CanvasAspectRatio>('3:4');
  const [showFaceGuide, setShowFaceGuide] = useState(true);
  const [palette, setPalette] = useState<PackPalette>(DEFAULT_PACK_PALETTE);
  const [packs, setPacks] = useState<PackManifest[]>(() => getCachedPacksForEvent(eventSlug));

  const [past, setPast] = useState<FrameLayer[][]>([]);
  const [future, setFuture] = useState<FrameLayer[][]>([]);

  const stageDims = ASPECT_RATIO_DIMENSIONS[aspectRatio];
  const stageWidth = stageDims.width;
  const stageHeight = stageDims.height;

  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  useEffect(() => {
    let active = true;
    void loadPacksForEvent(eventSlug).then((loaded) => {
      if (!active) return;
      setPacks((prev) => {
        if (prev.length === loaded.length && prev.every((p, idx) => p.id === loaded[idx].id)) {
          return prev;
        }
        return loaded;
      });
    });
    return () => {
      active = false;
    };
  }, [eventSlug]);

  /** Aplica un cambio registrando el estado previo en el historial de Undo/Redo. */
  function commitLayers(next: FrameLayer[]) {
    setPast((prev) => [...prev.slice(-29), layersRef.current]);
    setFuture([]);
    onChange(next);
  }

  function handleUndo() {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [layersRef.current, ...prev]);
    onChange(previous);
  }

  function handleRedo() {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, layersRef.current]);
    onChange(next);
  }

  const params = useMemo(() => ({ layers }), [layers]);
  const previewLayers = useMemo(
    () => (resolveImageUrl ? layers : layers.filter((l) => l.type !== 'image')),
    [layers, resolveImageUrl],
  );
  const konvaAssets = useLayerAssets(previewLayers, resolveImageUrl);

  const selectedLayer = selected >= 0 ? layers[selected] : undefined;
  // Sin asas de escala ni de giro: una imagen a pantalla completa, una forma pegada a los bordes o una capa bloqueada no se transforman.
  const isCover =
    (selectedLayer?.type === 'image' && selectedLayer.full === true) ||
    (selectedLayer ? isBoxed(selectedLayer) || isLocked(selectedLayer) : false);

  const replaceSelected = (layer: FrameLayer) =>
    commitLayers(layers.map((l, i) => (i === selected ? layer : l)));

  function handlePaletteChange(nextPalette: PackPalette) {
    const updated = recolorLayersByPalette(layers, palette, nextPalette);
    setPalette(nextPalette);
    if (layers.length > 0) {
      commitLayers(updated);
    }
  }

  function handleApplyPreset(preset: PackPreset, packPalette: PackPalette) {
    const effectivePalette: PackPalette = { ...packPalette, ...palette };
    const nextLayers = materializePresetLayers(preset, effectivePalette);
    commitLayers(nextLayers);
    setSelected(-1);
  }

  function handleAddPackAsset(packId: string, assetId: string) {
    const layer = createLayer('asset', {
      asset: `pack:${packId}/${assetId}`,
      tint: palette.acento,
      w: 0.24,
      h: 0.24,
    });
    const result = addLayer(layers, layer);
    if (result.index < 0) return;
    commitLayers(result.layers);
    setSelected(result.index);
  }

  function handleAddStyledText(presetKind: 'titulo' | 'subtitulo' | 'sello') {
    const layer: FrameLayer =
      presetKind === 'titulo'
        ? {
            type: 'text',
            text: 'TÍTULO NEÓN',
            x: 0.5,
            y: 1,
            dy: -0.12,
            size: 0.088,
            w: 0.68,
            font: 'anton',
            color: palette.acento,
            strokeColor: palette.fondo,
            strokeWidth: 0.012,
            shadow: { color: palette.acento, blur: 0.02, x: 0, y: 0 },
          }
        : presetKind === 'subtitulo'
          ? {
              type: 'text',
              text: '31 OCT · FIESTA VIP',
              x: 0.5,
              y: 1,
              dy: -0.05,
              size: 0.028,
              w: 0.7,
              font: 'mono',
              weight: 'bold',
              color: palette.texto,
            }
          : {
              type: 'text',
              text: 'BURN BOOK',
              x: 0.5,
              y: 0,
              dy: 0.08,
              size: 0.05,
              w: 0.65,
              font: 'marker',
              color: palette.texto,
              strokeColor: palette.fondo,
              strokeWidth: 0.008,
              rotation: -3,
            };
    const result = addLayer(layers, layer);
    if (result.index < 0) return;
    commitLayers(result.layers);
    setSelected(result.index);
  }

  /** Coordenadas del puntero en el sistema del lienzo (por si la pantalla lo achica con CSS). */
  function toStage(e: PointerEvent<HTMLElement>): Point {
    const rect = stageRef.current?.getBoundingClientRect();
    const scale = rect && rect.width > 0 ? rect.width / stageWidth : 1;
    return { x: (e.clientX - (rect?.left ?? 0)) / scale, y: (e.clientY - (rect?.top ?? 0)) / scale };
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button > 0) return;
    const pos = toStage(e);
    const handle = (e.target as HTMLElement).closest('[data-handle]')?.getAttribute('data-handle');

    if ((handle === 'scale' || handle === 'rotate') && selectedLayer && !isLocked(selectedLayer)) {
      gesture.current = { kind: handle, index: selected, start: pos, layer: selectedLayer };
    } else {
      const index = hitTest(layers, pos.x, pos.y, stageWidth, stageHeight);
      setSelected(index);
      gesture.current =
        index >= 0 && !isLocked(layers[index])
          ? { kind: 'move', index, start: pos, layer: layers[index] }
          : null;
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
      next = moveLayer(g.layer, pos.x - g.start.x, pos.y - g.start.y, stageWidth, stageHeight);
    } else {
      const b = layerBounds(g.layer, stageWidth, stageHeight);
      const center = { x: b.cx, y: b.cy };
      next =
        g.kind === 'scale'
          ? scaleLayer(g.layer, scaleFactorFromPointers(center, g.start, pos))
          : { ...g.layer, rotation: rotationFromPointer(center, pos) };
    }
    if (next !== g.layer) onChange(updateLayer(layersRef.current, g.index, next));
  }

  function endGesture() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const current = layersRef.current[g.index];
    if (current && current !== g.layer) {
      setPast((prev) => [...prev.slice(-29), layersRef.current.map((l, i) => (i === g.index ? g.layer : l))]);
      setFuture([]);
    }
  }

  function confirmDelete() {
    if (selected < 0) return;
    if (!window.confirm('¿Borrar esta capa?')) return;
    const result = removeLayer(layers, selected);
    commitLayers(result.layers);
    setSelected(result.index);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (selected >= 0) {
        const result = duplicateLayer(layers, selected);
        if (result.index >= 0) {
          commitLayers(result.layers);
          setSelected(result.index);
        }
      }
      return;
    }

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
      replaceSelected(moveLayer(selectedLayer, move[0] * stageWidth, move[1] * stageHeight, stageWidth, stageHeight));
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
    commitLayers(result.layers);
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
        commitLayers(result.layers);
        setSelected(result.index);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos subir la imagen.');
    } finally {
      setUploading(false);
    }
  }

  const bounds = selectedLayer ? layerBounds(selectedLayer, stageWidth, stageHeight) : null;

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return packs.flatMap((pack) =>
      pack.assets
        .filter((asset) => {
          if (categoryFilter !== 'all' && asset.category !== categoryFilter) return false;
          if (!q) return true;
          const haystack = `${asset.name} ${asset.id} ${(asset.tags ?? []).join(' ')}`.toLowerCase();
          return haystack.includes(q);
        })
        .map((asset) => ({ pack, asset })),
    );
  }, [packs, categoryFilter, searchQuery]);

  const atLimit = layers.length >= MAX_LAYERS;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" aria-label="Estudio de diseño">
      {/* ---- Columna Izquierda: Biblioteca (Presets, Elementos, Texto, Subidas) ---- */}
      <aside className="flex flex-col gap-3 border border-smoke-700/60 bg-ink-900 p-3 lg:col-span-4" aria-label="Biblioteca de diseño">
        <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Pestañas de biblioteca">
          {(
            [
              ['presets', 'Presets'],
              ['elementos', 'Elementos'],
              ['texto', 'Texto'],
              ['subidas', 'Subidas'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`h-8 px-2 font-mono text-xs uppercase tracking-wider ${
                activeTab === id ? 'bg-acid-400 text-ink-950 font-bold' : 'bg-ink-950 text-paper-100/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'presets' && (
          <div className="flex flex-col gap-2" role="tabpanel" aria-label="Biblioteca de Presets">
            <p className="font-sans text-xs text-paper-100/70">
              Elige un diseño completo de un clic y personaliza sus textos o su paleta de colores.
            </p>
            <div className="flex flex-col gap-2">
              {packs.flatMap((pack) =>
                pack.presets.map((preset) => (
                  <button
                    key={`${pack.id}-${preset.id}`}
                    type="button"
                    aria-label={`Aplicar preset ${preset.label}`}
                    onClick={() => handleApplyPreset(preset, pack.palette)}
                    className="flex flex-col gap-1 border border-smoke-700/60 bg-ink-950 p-2.5 text-left transition hover:border-acid-400"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-hotpink-500">
                        {preset.label}
                      </span>
                      <span className="font-mono text-xs uppercase text-paper-100/50">{pack.name}</span>
                    </div>
                    {preset.description && (
                      <span className="font-sans text-xs text-paper-100/70">{preset.description}</span>
                    )}
                  </button>
                )),
              )}
            </div>
          </div>
        )}

        {activeTab === 'elementos' && (
          <div className="flex flex-col gap-2" role="tabpanel" aria-label="Biblioteca de Elementos">
            <input
              type="search"
              aria-label="Buscar elementos"
              placeholder="Buscar conejita, antifaz, tiara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-ink-950 px-3 py-1.5 font-sans text-xs text-paper-100 outline-none border border-smoke-700/60"
            />
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por categoría">
              {CATEGORY_FILTERS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  aria-pressed={categoryFilter === cat.id}
                  className={`px-2 py-1 font-mono text-xs uppercase ${
                    categoryFilter === cat.id ? 'bg-hotpink-500 text-ink-950 font-bold' : 'bg-ink-950 text-paper-100/70'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
              {filteredAssets.map(({ pack, asset }) => (
                <button
                  key={`${pack.id}/${asset.id}`}
                  type="button"
                  disabled={atLimit}
                  aria-label={`Insertar ${asset.name}`}
                  onClick={() => handleAddPackAsset(pack.id, asset.id)}
                  className="flex flex-col items-start gap-1 border border-smoke-700/60 bg-ink-950 p-2 text-left hover:border-acid-400 disabled:opacity-40"
                >
                  <span className="font-sans text-xs font-medium text-paper-100">{asset.name}</span>
                  <span className="font-mono text-xs uppercase text-paper-100/50">{asset.category}</span>
                </button>
              ))}
              {filteredAssets.length === 0 && (
                <p className="col-span-2 py-3 font-sans text-xs text-paper-100/60">
                  No encontramos elementos para esa búsqueda.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'texto' && (
          <div className="flex flex-col gap-2" role="tabpanel" aria-label="Estilos de texto">
            <p className="font-sans text-xs text-paper-100/70">Agrega un estilo tipográfico del paquete:</p>
            <button
              type="button"
              disabled={atLimit}
              onClick={() => handleAddStyledText('titulo')}
              className="border border-smoke-700/60 bg-ink-950 p-2.5 text-left font-display text-sm uppercase tracking-wider text-hotpink-500 hover:border-acid-400 disabled:opacity-40"
            >
              + Título Neón (Anton)
            </button>
            <button
              type="button"
              disabled={atLimit}
              onClick={() => handleAddStyledText('subtitulo')}
              className="border border-smoke-700/60 bg-ink-950 p-2.5 text-left font-mono text-xs uppercase tracking-wider text-paper-100 hover:border-acid-400 disabled:opacity-40"
            >
              + Subtítulo Boleto (Mono)
            </button>
            <button
              type="button"
              disabled={atLimit}
              onClick={() => handleAddStyledText('sello')}
              className="border border-smoke-700/60 bg-ink-950 p-2.5 text-left font-sans text-xs font-bold uppercase tracking-wider text-acid-400 hover:border-acid-400 disabled:opacity-40"
            >
              + Sello Burn Book (Marker)
            </button>
          </div>
        )}

        {activeTab === 'subidas' && (
          <div className="flex flex-col gap-2" role="tabpanel" aria-label="Subidas del evento">
            <p className="font-sans text-xs text-paper-100/70">
              Sube ilustraciones o logos PNG/WebP con transparencia exclusivos de este evento.
            </p>
            {uploadImage ? (
              <p className="font-mono text-xs text-acid-400">
                Usa el botón «+ Imagen» en el panel de capas para subir un archivo a Storage.
              </p>
            ) : (
              <p className="font-sans text-xs text-paper-100/50">Subida de archivos no disponible en esta vista.</p>
            )}
          </div>
        )}
      </aside>

      {/* ---- Columna Central: Barra de Herramientas + Lienzo Konva ---- */}
      <div className="flex flex-col items-center gap-3 lg:col-span-4">
        <div
          className="flex flex-wrap items-center justify-center gap-1.5 border border-smoke-700/60 bg-ink-900 p-2 w-full"
          role="toolbar"
          aria-label="Herramientas del lienzo"
        >
          <div className="flex items-center gap-1" role="group" aria-label="Proporción del lienzo">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                aria-label={`Proporción ${ratio}`}
                aria-pressed={aspectRatio === ratio}
                onClick={() => setAspectRatio(ratio)}
                className={`h-7 px-2 font-mono text-xs ${
                  aspectRatio === ratio ? 'bg-acid-400 text-ink-950 font-bold' : 'bg-ink-950 text-paper-100/80'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1" role="group" aria-label="Historial">
            <button
              type="button"
              onClick={handleUndo}
              disabled={past.length === 0}
              aria-label="Deshacer"
              className={smallToolbarBtn}
            >
              ↶
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={future.length === 0}
              aria-label="Rehacer"
              className={smallToolbarBtn}
            >
              ↷
            </button>
          </div>

          <label className="flex items-center gap-1.5 px-1 font-mono text-xs uppercase text-paper-100/80">
            <input
              type="checkbox"
              checked={showFaceGuide}
              onChange={(e) => setShowFaceGuide(e.target.checked)}
              aria-label="Zona segura para caras"
            />
            Guía caras
          </label>
        </div>

        <div
          ref={stageRef}
          role="application"
          aria-label="Lienzo del marco"
          tabIndex={0}
          style={{ width: stageWidth, height: stageHeight, touchAction: 'none' }}
          className="relative shrink-0 cursor-crosshair select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-400"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onKeyDown={handleKeyDown}
        >
          <FramePreview
            template="capas"
            params={params}
            width={stageWidth}
            height={stageHeight}
            resolveImageUrl={resolveImageUrl}
            label="Vista previa del marco"
          />

          <Suspense fallback={null}>
            <LazyKonvaCanvasStage
              width={stageWidth}
              height={stageHeight}
              layers={layers}
              selected={selected}
              assets={konvaAssets}
              showFaceGuide={showFaceGuide}
              onSelect={setSelected}
              onChangeLayer={(index, nextLayer) => {
                commitLayers(updateLayer(layersRef.current, index, nextLayer));
              }}
            />
          </Suspense>

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

        <p className="max-w-[280px] text-center font-sans text-xs text-paper-100/60">
          Toca una capa para elegirla y arrástrala. El cuadrado de la esquina cambia el tamaño; el círculo de arriba la
          gira. Las piezas en las esquinas se anclan automáticamente para migrar entre 3:4, 4:3, 9:16 y 1:1.
        </p>
      </div>

      {/* ---- Columna Derecha: Paleta de Roles + Capas + Inspector de Propiedades ---- */}
      <div className="flex min-w-[220px] flex-col gap-4 lg:col-span-4">
        <section
          className="flex flex-col gap-2 border border-smoke-700/60 bg-ink-900 p-3"
          aria-label="Paleta de roles de color"
        >
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-hotpink-500">
            Paleta del diseño ($acento · $fondo · $texto)
          </span>
          <div className="flex flex-wrap gap-1">
            {PALETTE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-label={`Paleta ${preset.label}`}
                onClick={() => handlePaletteChange(preset.palette)}
                className="flex items-center gap-1 border border-smoke-700/60 bg-ink-950 px-2 py-1 font-mono text-xs text-paper-100 hover:border-acid-400"
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.palette.acento }} />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {(
              [
                ['acento', 'Rol $acento'],
                ['fondo', 'Rol $fondo'],
                ['texto', 'Rol $texto'],
              ] as const
            ).map(([roleKey, roleLabel]) => (
              <label key={roleKey} className="flex flex-col gap-1 font-mono text-xs uppercase text-paper-100/70">
                <span>{roleLabel}</span>
                <input
                  type="color"
                  aria-label={roleLabel}
                  value={palette[roleKey]}
                  onChange={(e) => handlePaletteChange({ ...palette, [roleKey]: e.target.value })}
                  className="h-7 w-full cursor-pointer border border-smoke-700/60 bg-ink-950"
                />
              </label>
            ))}
          </div>
        </section>

        <LayerPanel
          layers={layers}
          selected={selected}
          onSelect={setSelected}
          onAdd={handleAdd}
          onUploadFile={uploadImage ? (file) => void handleUpload(file) : undefined}
          uploading={uploading}
          onReorder={(direction) => {
            const result = reorderLayer(layers, selected, direction);
            commitLayers(result.layers);
            setSelected(result.index);
          }}
          onDuplicate={() => {
            const result = duplicateLayer(layers, selected);
            if (result.index < 0) return;
            commitLayers(result.layers);
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
