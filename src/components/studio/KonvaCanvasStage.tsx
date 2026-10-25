import { useEffect, useRef, useState } from 'react';
import { Ellipse, Image as KonvaImage, Layer, Line, Path, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  ROTATION_SNAP_ANGLES,
  ROTATION_SNAP_TOLERANCE,
  applyKonvaNodeTransform,
  computeSmartGuides,
  layerToKonvaGeometry,
  safeFaceZoneRect,
} from '../../lib/cameraAssets/konvaParity';
import { assetLayerKey, type FrameAssets, type FrameLayer } from '../../lib/cameraAssets/layers';
import { FONT_STACKS } from '../../lib/cameraAssets/text';

export interface KonvaCanvasStageProps {
  width: number;
  height: number;
  layers: readonly FrameLayer[];
  selected: number;
  assets?: FrameAssets;
  showFaceGuide?: boolean;
  onSelect: (index: number) => void;
  onChangeLayer: (index: number, nextLayer: FrameLayer) => void;
}

/**
 * Lienzo interactivo basado en `react-konva` (cargado exclusivamente en escritorio con `React.lazy()`).
 * Renderiza cada capa en su geometría exacta de `layerToKonvaGeometry`, adjunta `<Transformer />`
 * a la capa seleccionada (si no está bloqueada), muestra guías magnéticas al centro y convierte
 * al soltar (`onDragEnd` / `onTransformEnd`) la posición a anclajes de borde/esquina (`x, y, dx, dy`).
 */
export default function KonvaCanvasStage({
  width,
  height,
  layers,
  selected,
  assets,
  showFaceGuide = true,
  onSelect,
  onChangeLayer,
}: KonvaCanvasStageProps) {
  const unit = Math.min(width, height);
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
    if (node) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selected, canTransform, layers, width, height]);

  const setNodeRef = (index: number) => (node: Konva.Node | null) => {
    if (node) nodeRefs.current.set(index, node);
    else nodeRefs.current.delete(index);
  };

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const snapped = computeSmartGuides(node.x(), node.y(), width, height);
    if (snapped.verticalCenter) node.x(snapped.x);
    if (snapped.horizontalCenter) node.y(snapped.y);
    setGuides({ vertical: snapped.verticalCenter, horizontal: snapped.horizontalCenter });
  }

  function handleDragEnd(index: number, layer: FrameLayer, e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const snapped = computeSmartGuides(node.x(), node.y(), width, height);
    setGuides({ vertical: false, horizontal: false });
    const updated = applyKonvaNodeTransform(layer, { x: snapped.x, y: snapped.y }, width, height);
    onChangeLayer(index, updated);
  }

  function handleTransformEnd(index: number, layer: FrameLayer, e: Konva.KonvaEventObject<Event>) {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    node.scaleX(1);
    node.scaleY(1);
    setGuides({ vertical: false, horizontal: false });
    const updated = applyKonvaNodeTransform(
      layer,
      { x: node.x(), y: node.y(), scaleX, scaleY, rotation },
      width,
      height,
    );
    onChangeLayer(index, updated);
  }

  const faceZone = safeFaceZoneRect(width, height);

  return (
    <div data-testid="konva-stage-wrapper" className="pointer-events-none absolute inset-0">
      <Stage
        width={width}
        height={height}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) {
            onSelect(-1);
          }
        }}
      >
        <Layer>
          {layers.map((layer, index) => {
            const geom = layerToKonvaGeometry(layer, width, height);
            const commonProps = {
              ref: setNodeRef(index),
              x: geom.x,
              y: geom.y,
              width: geom.width,
              height: geom.height,
              offsetX: geom.offsetX,
              offsetY: geom.offsetY,
              rotation: geom.rotation,
              opacity: geom.opacity,
              draggable: geom.draggable,
              onClick: () => onSelect(index),
              onTap: () => onSelect(index),
              onDragMove: handleDragMove,
              onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(index, layer, e),
              onTransformEnd: (e: Konva.KonvaEventObject<Event>) => handleTransformEnd(index, layer, e),
            };

            switch (layer.type) {
              case 'text':
                return (
                  <Text
                    key={index}
                    {...commonProps}
                    text={layer.text}
                    fontFamily={FONT_STACKS[layer.font ?? 'sans']}
                    fontSize={geom.height}
                    fontStyle={layer.weight === 'bold' ? 'bold' : 'normal'}
                    fill={layer.color ?? '#ffffff'}
                    stroke={layer.strokeColor}
                    strokeWidth={(layer.strokeWidth ?? 0) * unit}
                    align="center"
                    verticalAlign="middle"
                  />
                );
              case 'emoji':
                return (
                  <Text
                    key={index}
                    {...commonProps}
                    text={layer.emoji}
                    fontSize={geom.height}
                    align="center"
                    verticalAlign="middle"
                  />
                );
              case 'shape': {
                const strokeWidth = (layer.strokeWidth ?? 0.01) * unit;
                const fill = layer.fill ?? (layer.stroke || layer.shape === 'line' ? undefined : '#ff4fa3');
                const stroke = layer.stroke ?? (layer.shape === 'line' ? '#ffffff' : undefined);
                if (layer.shape === 'rect') {
                  return (
                    <Rect
                      key={index}
                      {...commonProps}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      cornerRadius={(layer.radius ?? 0) * unit}
                    />
                  );
                }
                if (layer.shape === 'ellipse') {
                  return (
                    <Ellipse
                      key={index}
                      {...commonProps}
                      radiusX={geom.width / 2}
                      radiusY={geom.height / 2}
                      offsetX={geom.offsetX - geom.width / 2}
                      offsetY={geom.offsetY - geom.height / 2}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                    />
                  );
                }
                if (layer.shape === 'line') {
                  return (
                    <Line
                      key={index}
                      {...commonProps}
                      points={[0, 0, geom.width, 0]}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      lineCap="round"
                    />
                  );
                }
                return (
                  <Path
                    key={index}
                    {...commonProps}
                    data={layer.d ?? ''}
                    scaleX={geom.width / 100}
                    scaleY={geom.height / 100}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                  />
                );
              }
              case 'image':
              case 'asset': {
                const key = layer.type === 'image' ? layer.src : assetLayerKey(layer);
                const img =
                  assets?.images.get(key) ?? (layer.type === 'asset' ? assets?.images.get(layer.asset) : undefined);
                if (img && typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
                  return <KonvaImage key={index} {...commonProps} image={img} />;
                }
                return <Rect key={index} {...commonProps} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />;
              }
            }
          })}

          {showFaceGuide && (
            <Rect
              x={faceZone.x}
              y={faceZone.y}
              width={faceZone.width}
              height={faceZone.height}
              stroke="rgba(255, 255, 255, 0.32)"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          )}

          {guides.vertical && (
            <Line
              points={[width / 2, 0, width / 2, height]}
              stroke="#c8f23a"
              strokeWidth={1.5}
              dash={[4, 4]}
              listening={false}
            />
          )}

          {guides.horizontal && (
            <Line
              points={[0, height / 2, width, height / 2]}
              stroke="#c8f23a"
              strokeWidth={1.5}
              dash={[4, 4]}
              listening={false}
            />
          )}

          {canTransform && (
            <Transformer
              ref={trRef}
              keepRatio={true}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              rotationSnaps={[...ROTATION_SNAP_ANGLES]}
              rotationSnapTolerance={ROTATION_SNAP_TOLERANCE}
              borderStroke="#c8f23a"
              anchorStroke="#0d0b12"
              anchorFill="#c8f23a"
              anchorSize={8}
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
