import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ASPECT_RATIOS,
  ASPECT_RATIO_DIMENSIONS,
  fitStageSize,
  type CanvasAspectRatio,
} from '../../lib/cameraAssets/konvaParity';
import {
  addLayer,
  createLayer,
  duplicateLayer,
  moveLayer,
  removeLayer,
  reorderLayer,
  updateLayer,
  type NewLayerKind,
} from '../../lib/cameraAssets/layerOps';
import { MAX_LAYERS, type FrameLayer } from '../../lib/cameraAssets/layers';
import {
  DEFAULT_PACK_PALETTE,
  PALETTE_PRESETS,
  getCachedPacksForEvent,
  loadPacksForEvent,
  recolorLayersByPalette,
  type PackAssetCategory,
  type PackAssetMeta,
  type PackManifest,
  type PackPalette,
} from '../../lib/cameraAssets/packs';
import FramePreview from './FramePreview';
import LayerPanel from './LayerPanel';
import LayerProperties from './LayerProperties';

const LazyKonvaCanvasStage = lazy(() => import('./KonvaCanvasStage'));

type LibraryTab = 'elementos' | 'texto' | 'subidas';

interface LayerEditorProps {
  layers: FrameLayer[];
  onChange: (layers: FrameLayer[]) => void;
  /** Proporción fija del lienzo cuando el marco administra un diseño por proporción. */
  aspectRatio?: CanvasAspectRatio;
  /** Slug del evento activo para cargar paquetes privados además de los públicos. */
  eventSlug?: string;
  /** Sube una imagen y devuelve su ruta en Storage. Sin esto no se ofrece agregar imágenes. */
  uploadImage?: (file: File) => Promise<string>;
  /** Firma la ruta de una imagen para mostrarla en el lienzo. */
  resolveImageUrl?: (path: string) => Promise<string>;
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

const toolbarBtn =
  'h-8 border border-smoke-700/60 px-2.5 font-mono text-xs uppercase tracking-wider text-paper-100 transition-colors hover:border-acid-400 disabled:opacity-40 disabled:hover:border-smoke-700/60';

const columnClass = 'flex flex-col gap-3 border border-smoke-700/60 bg-ink-900 p-3';

/**
 * Estudio de Diseño de 3 columnas (solo escritorio >= 1024px):
 * - Izquierda (300 px): biblioteca con pestañas Elementos (búsqueda y filtro por categoría), Texto y Subidas.
 * - Centro (el espacio que queda): barra de herramientas (proporción 3:4 / 4:3 / 9:16 / 1:1, deshacer y rehacer,
 *   zona de caras) y el lienzo, que se ajusta al espacio disponible.
 * - Derecha (300 px): paleta por roles ($acento, $fondo, $texto), lista de capas y propiedades de la capa elegida.
 *
 * El lienzo muestra lo que dibuja `renderFrame` (como la foto final); `KonvaCanvasStage` va encima solo para
 * seleccionar, arrastrar, escalar y girar.
 */
export default function LayerEditor({
  layers,
  onChange,
  aspectRatio: fixedAspectRatio,
  eventSlug,
  uploadImage,
  resolveImageUrl,
}: LayerEditorProps) {
  const [selectedRaw, setSelected] = useState(-1);
  const selected = selectedRaw >= 0 && selectedRaw < layers.length ? selectedRaw : -1;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del Estudio (pestaña de biblioteca, búsqueda, categoría, proporción, paleta, guía e historial Undo/Redo)
  const [activeTab, setActiveTab] = useState<LibraryTab>('elementos');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PackAssetCategory>('all');
  const [internalAspectRatio, setAspectRatio] = useState<CanvasAspectRatio>('3:4');
  const aspectRatio = fixedAspectRatio ?? internalAspectRatio;
  const [showFaceGuide, setShowFaceGuide] = useState(true);
  const [palette, setPalette] = useState<PackPalette>(DEFAULT_PACK_PALETTE);
  const [packs, setPacks] = useState<PackManifest[]>(() => getCachedPacksForEvent(eventSlug));

  const [past, setPast] = useState<FrameLayer[][]>([]);
  const [future, setFuture] = useState<FrameLayer[][]>([]);

  // El lienzo ocupa el espacio que dejan las columnas laterales, con la proporción elegida.
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const stageSize = area
    ? fitStageSize(aspectRatio, area.width, area.height)
    : ASPECT_RATIO_DIMENSIONS[aspectRatio];
  const stageWidth = stageSize.width;
  const stageHeight = stageSize.height;

  const layersRef = useRef(layers);
  layersRef.current = layers;

  // FrameEditor desmonta este editor al cambiar de proporción: una subida que termina después ya no debe escribir en ella.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () =>
      setArea({ width: el.clientWidth, height: Math.min(900, Math.max(360, window.innerHeight - 300)) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

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

  // Mientras se arrastra o se transforma una capa, el lienzo la dibuja donde quedaría; al soltar se confirma.
  const [live, setLive] = useState<{ index: number; layer: FrameLayer } | null>(null);
  const params = useMemo(
    () => ({ layers: live ? layers.map((l, i) => (i === live.index ? live.layer : l)) : layers }),
    [layers, live],
  );
  const selectedLayer = selected >= 0 ? layers[selected] : undefined;

  const replaceSelected = (layer: FrameLayer) =>
    commitLayers(layers.map((l, i) => (i === selected ? layer : l)));

  function handlePaletteChange(nextPalette: PackPalette) {
    const updated = recolorLayersByPalette(layers, palette, nextPalette);
    setPalette(nextPalette);
    if (layers.length > 0) {
      commitLayers(updated);
    }
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

  function handleAddStyledText(presetKind: 'titulo' | 'subtitulo' | 'sello' | 'cursiva') {
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
        : presetKind === 'cursiva'
          ? {
              type: 'text',
              text: 'Cumpleaños Fran',
              x: 0.5,
              y: 1,
              dy: -0.12,
              size: 0.09,
              w: 0.68,
              font: 'pacifico',
              color: palette.texto,
              strokeColor: palette.acento,
              strokeWidth: 0.006,
              shadow: { color: palette.acento, blur: 0.03, x: 0, y: 0 },
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
              font: 'elite',
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
      if (!mountedRef.current) return;
      const result = addLayer(layersRef.current, createLayer('image', { src }));
      if (result.index >= 0) {
        commitLayers(result.layers);
        setSelected(result.index);
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'No pudimos subir la imagen.');
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  }

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
    <div
      className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)_300px] lg:items-start"
      aria-label="Estudio de diseño"
    >
      {/* ---- Columna izquierda: biblioteca (elementos, texto, subidas) ---- */}
      <aside
        className={`${columnClass} lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`}
        aria-label="Biblioteca de diseño"
      >
        <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Pestañas de biblioteca">
          {(
            [
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
              className={`h-9 truncate px-1 font-mono text-xs uppercase transition-colors ${
                activeTab === id
                  ? 'bg-acid-400 font-bold text-ink-950'
                  : 'bg-ink-950 text-paper-100/80 hover:text-paper-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'elementos' && (
          <div className="flex flex-col gap-3" role="tabpanel" aria-label="Biblioteca de Elementos">
            <input
              type="search"
              aria-label="Buscar elementos"
              placeholder="Buscar conejita, antifaz, tiara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border border-smoke-700/60 bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none focus-visible:border-acid-400"
            />
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por categoría">
              {CATEGORY_FILTERS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  aria-pressed={categoryFilter === cat.id}
                  className={`h-8 px-2.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                    categoryFilter === cat.id
                      ? 'bg-hotpink-500 font-bold text-ink-950'
                      : 'bg-ink-950 text-paper-100/70 hover:text-paper-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            {packs.length === 0 && <p className="font-sans text-xs text-paper-100/60">Cargando elementos...</p>}
            <div className="grid grid-cols-2 gap-2">
              {filteredAssets.map(({ pack, asset }) => (
                <AssetCard
                  key={`${pack.id}/${asset.id}`}
                  packId={pack.id}
                  asset={asset}
                  tint={palette.acento}
                  disabled={atLimit}
                  onInsert={() => handleAddPackAsset(pack.id, asset.id)}
                />
              ))}
              {packs.length > 0 && filteredAssets.length === 0 && (
                <p className="col-span-2 py-3 font-sans text-xs text-paper-100/60">
                  No encontramos elementos para esa búsqueda.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'texto' && (
          <div className="flex flex-col gap-2" role="tabpanel" aria-label="Estilos de texto">
            <p className="font-sans text-xs text-paper-100/70">Agrega un estilo de texto ya diseñado:</p>
            <button
              type="button"
              disabled={atLimit}
              onClick={() => handleAddStyledText('titulo')}
              className="border border-smoke-700/60 bg-ink-950 p-3 text-left font-display text-base uppercase tracking-wider text-hotpink-500 transition-colors hover:border-acid-400 disabled:opacity-40"
            >
              + Título neón (Anton)
            </button>
            <button
              type="button"
              disabled={atLimit}
              onClick={() => handleAddStyledText('cursiva')}
              className="border border-smoke-700/60 bg-ink-950 p-3 text-left font-sans text-sm font-bold uppercase tracking-wider text-hotpink-500 transition-colors hover:border-acid-400 disabled:opacity-40"
            >
              + Título cursiva (Pacifico)
            </button>
            <button
              type="button"
              disabled={atLimit}
              onClick={() => handleAddStyledText('subtitulo')}
              className="border border-smoke-700/60 bg-ink-950 p-3 text-left font-mono text-xs font-bold uppercase tracking-wider text-paper-100 transition-colors hover:border-acid-400 disabled:opacity-40"
            >
              + Subtítulo boleto (Elite)
            </button>
            <button
              type="button"
              disabled={atLimit}
              onClick={() => handleAddStyledText('sello')}
              className="border border-smoke-700/60 bg-ink-950 p-3 text-left font-sans text-sm font-bold uppercase tracking-wider text-acid-400 transition-colors hover:border-acid-400 disabled:opacity-40"
            >
              + Sello Burn Book (Marker)
            </button>
          </div>
        )}

        {activeTab === 'subidas' && (
          <div className="flex flex-col gap-2" role="tabpanel" aria-label="Subidas del evento">
            <p className="font-sans text-xs text-paper-100/70">
              Sube ilustraciones o logos PNG/WebP con transparencia, solo para este evento.
            </p>
            {uploadImage ? (
              <p className="font-mono text-xs text-acid-400">
                Usa el botón «+ Imagen» del panel de capas para subir un archivo.
              </p>
            ) : (
              <p className="font-sans text-xs text-paper-100/50">Subida de archivos no disponible en esta vista.</p>
            )}
          </div>
        )}
      </aside>

      {/* ---- Columna central: barra de herramientas + lienzo ---- */}
      <div className="flex min-w-0 flex-col items-center gap-3">
        <div
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 border border-smoke-700/60 bg-ink-900 p-2"
          role="toolbar"
          aria-label="Herramientas del lienzo"
        >
          {!fixedAspectRatio && (
            <>
              <div className="flex items-center gap-2" role="group" aria-label="Proporción del lienzo">
                <span className="font-mono text-xs uppercase tracking-wider text-paper-100/50">Formato</span>
                <div className="inline-flex">
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      aria-label={`Proporción ${ratio}`}
                      aria-pressed={aspectRatio === ratio}
                      title={ASPECT_RATIO_DIMENSIONS[ratio].label}
                      onClick={() => setAspectRatio(ratio)}
                      className={`h-8 min-w-11 px-2.5 font-mono text-xs transition-colors ${
                        aspectRatio === ratio
                          ? 'bg-acid-400 font-bold text-ink-950'
                          : 'bg-ink-950 text-paper-100/80 hover:text-paper-100'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <span aria-hidden="true" className="hidden h-6 w-px bg-smoke-700/60 sm:block" />
            </>
          )}

          <div className="flex items-center gap-1" role="group" aria-label="Historial">
            <button
              type="button"
              onClick={handleUndo}
              disabled={past.length === 0}
              aria-label="Deshacer"
              title="Deshacer (Ctrl+Z)"
              className={toolbarBtn}
            >
              ↶ Deshacer
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={future.length === 0}
              aria-label="Rehacer"
              title="Rehacer (Ctrl+Y)"
              className={toolbarBtn}
            >
              Rehacer ↷
            </button>
          </div>

          <span aria-hidden="true" className="hidden h-6 w-px bg-smoke-700/60 sm:block" />

          <label className="flex min-h-8 cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-wide text-paper-100/80">
            <input
              type="checkbox"
              checked={showFaceGuide}
              onChange={(e) => setShowFaceGuide(e.target.checked)}
              aria-label="Zona segura para caras"
            />
            Zona de caras
          </label>
        </div>

        <div ref={areaRef} className="flex w-full justify-center bg-ink-950/60 py-6">
          <div
            role="application"
            aria-label="Lienzo del marco"
            tabIndex={0}
            style={{ width: stageWidth, height: stageHeight, touchAction: 'none' }}
            className="relative shrink-0 select-none shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_12px_40px_rgba(0,0,0,0.55)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-400"
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
                showFaceGuide={showFaceGuide}
                onSelect={setSelected}
                onPreviewLayer={(index, layer) => setLive(layer ? { index, layer } : null)}
                onChangeLayer={(index, nextLayer) => {
                  commitLayers(updateLayer(layersRef.current, index, nextLayer));
                }}
              />
            </Suspense>
          </div>
        </div>

        <p className="max-w-md text-center font-sans text-xs text-paper-100/60">
          Arrastra una pieza para moverla. Las esquinas cambian el tamaño y el círculo de arriba la gira. Con el lienzo
          enfocado: flechas para mover, Supr para borrar, Ctrl+D para duplicar. Las piezas pegadas a una esquina se
          reacomodan solas al cambiar de formato.
        </p>
      </div>

      {/* ---- Columna derecha: paleta + capas + propiedades ---- */}
      <div className="flex min-w-0 flex-col gap-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <section className={columnClass} aria-label="Paleta de roles de color">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-hotpink-500">Paleta del diseño</span>
          <p className="font-sans text-xs text-paper-100/60">Cambia los tres colores de todo el diseño a la vez.</p>
          <div className="flex flex-wrap gap-1">
            {PALETTE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-label={`Paleta ${preset.label}`}
                onClick={() => handlePaletteChange(preset.palette)}
                className="flex h-8 items-center gap-1.5 border border-smoke-700/60 bg-ink-950 px-2 font-mono text-xs text-paper-100 transition-colors hover:border-acid-400"
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.palette.acento }} />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {(
              [
                ['acento', 'Acento', 'Rol $acento'],
                ['fondo', 'Fondo', 'Rol $fondo'],
                ['texto', 'Letras', 'Rol $texto'],
              ] as const
            ).map(([roleKey, roleText, roleLabel]) => (
              <label key={roleKey} className="flex flex-col gap-1 font-mono text-xs uppercase text-paper-100/70">
                <span>{roleText}</span>
                <input
                  type="color"
                  aria-label={roleLabel}
                  value={palette[roleKey]}
                  onChange={(e) => handlePaletteChange({ ...palette, [roleKey]: e.target.value })}
                  className="h-8 w-full cursor-pointer border border-smoke-700/60 bg-ink-950"
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

/** Tarjeta de una pieza del catálogo: miniatura recoloreada con el acento actual. */
function AssetCard({
  packId,
  asset,
  tint,
  disabled,
  onInsert,
}: {
  packId: string;
  asset: PackAssetMeta;
  tint: string;
  disabled: boolean;
  onInsert: () => void;
}) {
  const params = useMemo(
    () => ({
      layers: [
        { type: 'asset', asset: `pack:${packId}/${asset.id}`, tint, x: 0.5, y: 0.5, w: 0.86, h: 0.86 },
      ] as FrameLayer[],
    }),
    [packId, asset.id, tint],
  );
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Insertar ${asset.name}`}
      onClick={onInsert}
      className="flex flex-col gap-1.5 border border-smoke-700/60 bg-ink-950 p-2 text-left transition-colors hover:border-acid-400 focus-visible:border-acid-400 disabled:opacity-40"
    >
      <span className="flex justify-center bg-ink-900">
        <FramePreview
          template="capas"
          params={params}
          width={96}
          height={96}
          background="oscuro"
          label={`Miniatura de ${asset.name}`}
        />
      </span>
      <span className="font-sans text-xs font-medium leading-tight text-paper-100">{asset.name}</span>
      <span className="font-mono text-xs uppercase text-paper-100/50">{asset.category}</span>
    </button>
  );
}
