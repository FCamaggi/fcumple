import { useEffect, useRef } from 'react';
import { frameCapture, photoBox } from '../../lib/cameraAssets/capture';
import { renderFrame, type FrameParams } from '../../lib/cameraAssets/frames';
import { useLayerAssets } from '../../hooks/useLayerAssets';

interface FramePreviewProps {
  template: string;
  params: FrameParams;
  width: number;
  height: number;
  label?: string;
  /** `foto` (por defecto): imagen de ejemplo; `oscuro`: fondo liso, para ver una pieza suelta. */
  background?: 'foto' | 'oscuro';
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
export default function FramePreview({
  template,
  params,
  width,
  height,
  label,
  background = 'foto',
  resolveImageUrl,
}: FramePreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Las imágenes de Storage solo se firman si llega `resolveImageUrl`; los recursos `asset` (/packs/...) y fuentes web siempre se cargan.
  const previewLayers =
    template === 'capas'
      ? resolveImageUrl
        ? params.layers
        : params.layers?.filter((l) => l.type !== 'image')
      : undefined;
  const assets = useLayerAssets(previewLayers, resolveImageUrl ?? NO_RESOLVER);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    if (background === 'oscuro') {
      ctx.fillStyle = '#17121f';
      ctx.fillRect(0, 0, w, h);
    } else {
      const capture = frameCapture(params.layers);
      if (capture) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);

        const box = photoBox(capture);
        const bx = box.x * w;
        const by = box.y * h;
        const bw = box.w * w;
        const bh = box.h * h;
        const bUnit = Math.min(bw, bh);

        const gradient = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        gradient.addColorStop(0, '#7aa7ff');
        gradient.addColorStop(1, '#ffb199');
        ctx.fillStyle = gradient;
        ctx.fillRect(bx, by, bw, bh);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(bx + bw / 2, by + bh * 0.42, bUnit * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(bx + bw / 2, by + bh * 0.82, bUnit * 0.32, bUnit * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();

        const gridLines = 8;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i <= gridLines; i++) {
          const t = i / (gridLines + 1);
          const gx = bx + bw * t;
          ctx.moveTo(gx, by);
          ctx.lineTo(gx, by + bh);
          const gy = by + bh * t;
          ctx.moveTo(bx, gy);
          ctx.lineTo(bx + bw, gy);
        }
        ctx.stroke();
      } else {
        // Fondo de ejemplo: degradé suave con una figura, para ver el marco en contexto.
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
      }
    }

    renderFrame(ctx, w, h, template, params, assets);
  }, [template, params, width, height, assets, background]);

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
