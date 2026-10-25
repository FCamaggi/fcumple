import { useEffect, useRef, useState } from 'react';
import { Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  ROTATION_SNAP_ANGLES,
  ROTATION_SNAP_TOLERANCE,
  applyKonvaNodeTransform,
  computeSmartGuides,
  layerToKonvaGeometry,
  safeFaceZoneRect,
} from '../../lib/cameraAssets/konvaParity';
import type { FrameLayer } from '../../lib/cameraAssets/layers';

export interface KonvaCanvasStageProps {
  width: number;
  height: number;
  layers: readonly FrameLayer[];
  selected: number;
  showFaceGuide?: boolean;
  onSelect: (index: number) => void;
  onChangeLayer: (index: number, nextLayer: FrameLayer) => void;
  /** Mientras dura un gesto, la capa tal como quedaría; `null` al terminarlo. Permite dibujarla en vivo. */
  onPreviewLayer?: (index: number, layer: FrameLayer | null) => void;
}

/** Konva solo detecta el puntero sobre una forma con relleno; `transparent` cuenta como relleno y no pinta nada. */
const HIT_FILL = 'transparent';
const ACCENT = '#c8f23a';

/**
 * Capa de interacción del lienzo, basada en `react-konva` (se carga solo en escritorio con `React.lazy()`).
 *
 * No dibuja el diseño: lo que se ve lo pinta `renderFrame` (la misma función de la foto final) en el canvas de
 * debajo, así la paridad es exacta por construcción. Aquí cada capa es una caja invisible con su geometría de
 * `layerToKonvaGeometry`, para arrastrarla y para que el `<Transformer />` la escale y la gire. Al soltar
 * (`onDragEnd` / `onTransformEnd`) la posición se convierte a anclajes de borde o esquina (`x, y, dx, dy`), y
 * mientras se arrastra se muestran guías magnéticas al centro.
 */
export default function KonvaCanvasStage({
  width,
  height,
  layers,
  selected,
  showFaceGuide = true,
  onSelect,
  onChangeLayer,
  onPreviewLayer,
}: KonvaCanvasStageProps) {
  const trRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Map<number, Konva.Node>>(new Map());
  const [guides, setGuides] = useState<{ vertical: boolean; horizontal: boolean }>({
    vertical: false,
    horizontal: false,
  });

  const selectedLayer = selected >= 0 && selected < layers.length ? layers[selected] : undefined;
  const selectedGeom = selectedLayer ? layerToKonvaGeometry(selectedLayer, width, height) : undefined;
  const canTransform = Boolean(selectedGeom?.transformable);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = canTransform ? nodeRefs.current.get(selected) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, canTransform, layers, width, height]);

  const setNodeRef = (index: number) => (node: Konva.Node | null) => {
    if (node) nodeRefs.current.set(index, node);
    else nodeRefs.current.delete(index);
  };

  function setCursor(e: Konva.KonvaEventObject<MouseEvent>, cursor: string) {
    const container = e.target.getStage()?.container();
    if (container) container.style.cursor = cursor;
  }

  function handleDragMove(index: number, layer: FrameLayer, e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const snapped = computeSmartGuides(node.x(), node.y(), width, height);
    if (snapped.verticalCenter) node.x(snapped.x);
    if (snapped.horizontalCenter) node.y(snapped.y);
    setGuides({ vertical: snapped.verticalCenter, horizontal: snapped.horizontalCenter });
    onPreviewLayer?.(index, applyKonvaNodeTransform(layer, { x: node.x(), y: node.y() }, width, height));
  }

  function handleTransform(index: number, layer: FrameLayer, e: Konva.KonvaEventObject<Event>) {
    const node = e.target;
    onPreviewLayer?.(
      index,
      applyKonvaNodeTransform(
        layer,
        { x: node.x(), y: node.y(), scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation() },
        width,
        height,
      ),
    );
  }

  function handleDragEnd(index: number, layer: FrameLayer, e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const snapped = computeSmartGuides(node.x(), node.y(), width, height);
    setGuides({ vertical: false, horizontal: false });
    onPreviewLayer?.(index, null);
    onChangeLayer(index, applyKonvaNodeTransform(layer, { x: snapped.x, y: snapped.y }, width, height));
  }

  function handleTransformEnd(index: number, layer: FrameLayer, e: Konva.KonvaEventObject<Event>) {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    node.scaleX(1);
    node.scaleY(1);
    setGuides({ vertical: false, horizontal: false });
    onPreviewLayer?.(index, null);
    onChangeLayer(
      index,
      applyKonvaNodeTransform(layer, { x: node.x(), y: node.y(), scaleX, scaleY, rotation }, width, height),
    );
  }

  const faceZone = safeFaceZoneRect(width, height);

  return (
    <div data-testid="konva-stage-wrapper" className="absolute inset-0">
      <Stage
        width={width}
        height={height}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) onSelect(-1);
        }}
        onTouchStart={(e) => {
          if (e.target === e.target.getStage()) onSelect(-1);
        }}
      >
        <Layer>
          {showFaceGuide && (
            <>
              <Rect
                x={faceZone.x}
                y={faceZone.y}
                width={faceZone.width}
                height={faceZone.height}
                stroke="rgba(255, 255, 255, 0.7)"
                strokeWidth={1}
                dash={[6, 6]}
                cornerRadius={6}
                listening={false}
              />
              <Text
                x={faceZone.x}
                y={faceZone.y + 6}
                width={faceZone.width}
                text="ZONA DE CARAS"
                align="center"
                fontSize={12}
                fontFamily="monospace"
                letterSpacing={1}
                fill="rgba(255, 255, 255, 0.7)"
                listening={false}
              />
            </>
          )}

          {layers.map((layer, index) => {
            const geom = layerToKonvaGeometry(layer, width, height);
            return (
              <Rect
                key={index}
                ref={setNodeRef(index)}
                x={geom.x}
                y={geom.y}
                width={geom.width}
                height={Math.max(geom.height, 4)}
                offsetX={geom.offsetX}
                offsetY={geom.offsetY}
                rotation={geom.rotation}
                fill={HIT_FILL}
                draggable={geom.draggable}
                onClick={() => onSelect(index)}
                onTap={() => onSelect(index)}
                onMouseDown={() => onSelect(index)}
                onMouseEnter={(e) => setCursor(e, geom.draggable ? 'move' : 'pointer')}
                onMouseLeave={(e) => setCursor(e, 'default')}
                onDragMove={(e) => handleDragMove(index, layer, e)}
                onTransform={(e) => handleTransform(index, layer, e)}
                onDragEnd={(e) => handleDragEnd(index, layer, e)}
                onTransformEnd={(e) => handleTransformEnd(index, layer, e)}
              />
            );
          })}

          {/* Capa elegida pero no transformable (a pantalla completa, pegada a los bordes o bloqueada): solo se marca. */}
          {selectedGeom && !canTransform && (
            <Rect
              x={selectedGeom.x}
              y={selectedGeom.y}
              width={selectedGeom.width}
              height={Math.max(selectedGeom.height, 4)}
              offsetX={selectedGeom.offsetX}
              offsetY={selectedGeom.offsetY}
              rotation={selectedGeom.rotation}
              stroke={ACCENT}
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
            />
          )}

          {guides.vertical && (
            <Line points={[width / 2, 0, width / 2, height]} stroke={ACCENT} strokeWidth={1} listening={false} />
          )}
          {guides.horizontal && (
            <Line points={[0, height / 2, width, height / 2]} stroke={ACCENT} strokeWidth={1} listening={false} />
          )}

          {canTransform && (
            <Transformer
              ref={trRef}
              keepRatio={true}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              rotationSnaps={[...ROTATION_SNAP_ANGLES]}
              rotationSnapTolerance={ROTATION_SNAP_TOLERANCE}
              rotateAnchorOffset={30}
              borderStroke={ACCENT}
              borderStrokeWidth={1.5}
              anchorStroke="#0d0b12"
              anchorStrokeWidth={1.5}
              anchorFill={ACCENT}
              anchorSize={14}
              anchorCornerRadius={3}
              padding={2}
              boundBoxFunc={(oldBox, newBox) =>
                Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10 ? oldBox : newBox
              }
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
