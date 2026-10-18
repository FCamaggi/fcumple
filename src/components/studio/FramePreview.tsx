import { useEffect, useRef } from 'react';
import { renderFrame, type FrameParams } from '../../lib/cameraAssets/frames';
import { useLayerAssets } from '../../hooks/useLayerAssets';

interface FramePreviewProps {
  template: string;
  params: FrameParams;
  width: number;
  height: number;
  label?: string;
  /**
   * Firma la ruta de Storage de una imagen de capa. Sin esto, un marco `capas` se
   * dibuja sin sus imágenes (vale para las vistas previas que no las necesitan).
   */
  resolveImageUrl?: (path: string) => Promise<string>;
}

const NO_RESOLVER = async (): Promise<string> => {
  throw new Error('Sin resolver de imágenes');
};

/**
 * Vista previa de un marco sobre una imagen de ejemplo. Usa EXACTAMENTE la misma
 * función de dibujo que la cámara de los invitados, así que lo que el organizador
 * ve es lo que saldrá en las fotos.
 */
export default function FramePreview({ template, params, width, height, label, resolveImageUrl }: FramePreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Las capas no se leen si no hay con qué firmar las imágenes: así no se carga nada de más.
  const assets = useLayerAssets(template === 'capas' && resolveImageUrl ? params.layers : undefined, resolveImageUrl ?? NO_RESOLVER);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fondo de ejemplo: degradé suave con una figura, para ver el marco en contexto.
    const w = canvas.width;
    const h = canvas.height;
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#7aa7ff');
    gradient.addColorStop(1, '#ffb199');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, Math.min(w, h) * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.82, Math.min(w, h) * 0.32, Math.min(w, h) * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    renderFrame(ctx, w, h, template, params, assets);
  }, [template, params, width, height, assets]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label ?? 'Vista previa del marco'}
      style={{ width, height }}
      className="shrink-0 bg-ink-950"
    />
  );
}
