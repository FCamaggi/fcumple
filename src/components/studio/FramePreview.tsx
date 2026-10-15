import { useEffect, useRef } from 'react';
import { renderFrame, type FrameParams } from '../../lib/cameraAssets/frames';

interface FramePreviewProps {
  template: string;
  params: FrameParams;
  width: number;
  height: number;
  label?: string;
}

/**
 * Vista previa de un marco sobre una imagen de ejemplo. Usa EXACTAMENTE la misma
 * función de dibujo que la cámara de los invitados, así que lo que el organizador
 * ve es lo que saldrá en las fotos.
 */
export default function FramePreview({ template, params, width, height, label }: FramePreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);

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

    renderFrame(ctx, w, h, template, params);
  }, [template, params, width, height]);

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
