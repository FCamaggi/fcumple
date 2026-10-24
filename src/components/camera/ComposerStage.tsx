import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  EMOJI_FONT_STACK,
  applyPinch,
  moveBy,
  stickerPixelSize,
  type StickerPlacement,
} from '../../lib/cameraAssets/stickers';
import type { CameraFrameOption, CameraStickerOption } from './types';

interface ComposerStageProps {
  /** ancho / alto del video: el escenario tiene EXACTAMENTE la proporción de la foto final. */
  aspect: number;
  frame: CameraFrameOption | null;
  placements: StickerPlacement[];
  options: ReadonlyMap<string, CameraStickerOption>;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onChange: (next: StickerPlacement) => void;
  /** El <video> en vivo. */
  children: ReactNode;
}

interface Size {
  w: number;
  h: number;
}

/** Mayor caja con proporción `aspect` que cabe en `container`. */
export function fitBox(container: Size, aspect: number): Size {
  if (!(container.w > 0) || !(container.h > 0) || !(aspect > 0) || !Number.isFinite(aspect)) return { w: 0, h: 0 };
  const byWidth = { w: container.w, h: container.w / aspect };
  return byWidth.h <= container.h ? byWidth : { w: container.h * aspect, h: container.h };
}

function useElementSize(ref: React.RefObject<HTMLElement>): Size {
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

interface Gesture {
  uid: string;
  start: StickerPlacement;
  /** Un dedo: posición inicial. Dos dedos: distancia y ángulo iniciales. */
  origin: { x: number; y: number };
  pinch: { distance: number; angle: number } | null;
}

/**
 * ComposerStage — el escenario de la cámara con marco y stickers. Mide exactamente
 * lo que va a salir en la foto (misma proporción del video, sin recortes), así
 * lo que el invitado ve es lo que se graba. Gestos: arrastrar con un dedo, y
 * pellizcar con dos para escalar y girar.
 */
export default function ComposerStage({
  aspect,
  frame,
  placements,
  options,
  selectedUid,
  onSelect,
  onChange,
  children,
}: ComposerStageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const container = useElementSize(wrapperRef);
  const stage = fitBox(container, aspect);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  // El marco se redibuja al cambiar de marco o de tamaño del escenario.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || stage.w <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(stage.w * dpr);
    canvas.height = Math.round(stage.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame?.draw?.(ctx, canvas.width, canvas.height);
  }, [frame, stage.w, stage.h]);

  function placementOf(uid: string) {
    return placements.find((p) => p.uid === uid) ?? null;
  }

  function beginGesture(uid: string) {
    const target = placementOf(uid);
    if (!target) return;
    const points = [...pointers.current.values()];
    gesture.current = {
      uid,
      start: target,
      origin: points[0] ?? { x: 0, y: 0 },
      pinch:
        points.length >= 2
          ? {
              distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
              angle: Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x),
            }
          : null,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const hit = (event.target as HTMLElement).closest<HTMLElement>('[data-sticker-uid]');
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* algunos navegadores lanzan si el puntero ya no existe */
    }

    if (hit) {
      const uid = hit.dataset.stickerUid as string;
      onSelect(uid);
      beginGesture(uid);
    } else if (pointers.current.size >= 2 && selectedUid) {
      // El segundo dedo puede caer fuera del sticker: igual cuenta para el pellizco.
      beginGesture(selectedUid);
    } else if (pointers.current.size === 1) {
      onSelect(null);
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    if (!g || stage.w <= 0) return;

    const points = [...pointers.current.values()];
    if (points.length >= 2 && g.pinch) {
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const angle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
      onChange(applyPinch(g.start, g.pinch.distance, g.pinch.angle, distance, angle));
    } else if (points.length === 1) {
      const dx = (points[0].x - g.origin.x) / stage.w;
      const dy = (points[0].y - g.origin.y) / stage.h;
      onChange(moveBy(g.start, dx, dy));
    }
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
    } else if (gesture.current) {
      // Quedó un dedo: el arrastre sigue desde donde está ahora, con el sticker como quedó.
      const current = placementOf(gesture.current.uid) ?? gesture.current.start;
      gesture.current = { uid: gesture.current.uid, start: current, origin: [...pointers.current.values()][0], pinch: null };
    }
  }

  return (
    <div ref={wrapperRef} className="relative flex flex-1 items-center justify-center overflow-hidden bg-ink-950">
      <div
        data-testid="composer-stage"
        className="relative touch-none overflow-hidden"
        style={{ width: stage.w, height: stage.h }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {children}
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
          data-testid="frame-overlay"
        />
        {placements.map((placement) => {
          const option = options.get(placement.assetId);
          if (!option) return null;
          const size = stickerPixelSize(stage.w, stage.h, placement.scale);
          const selected = placement.uid === selectedUid;
          return (
            <div
              key={placement.uid}
              data-sticker-uid={placement.uid}
              data-selected={selected}
              aria-label={`Sticker ${option.label}${selected ? ' (seleccionado)' : ''}`}
              className={`absolute flex touch-none select-none items-center justify-center ${
                selected ? 'outline outline-2 outline-offset-2 outline-hotpink-500' : ''
              }`}
              style={{
                left: `${placement.x * 100}%`,
                top: `${placement.y * 100}%`,
                width: size,
                height: size,
                transform: `translate(-50%, -50%) rotate(${placement.rotation}rad)`,
              }}
            >
              {option.asset.kind === 'emoji' ? (
                <span style={{ fontSize: size, lineHeight: 1, fontFamily: EMOJI_FONT_STACK }}>{option.asset.emoji}</span>
              ) : (
                <img
                  src={option.previewSrc}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-contain"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
