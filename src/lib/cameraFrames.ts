/**
 * cameraFrames -- marcos de foto de la cámara dedicada del invitado (Etapa
 * 9, Frente 1 del backlog). Cada marco es UNA función de dibujo pura sobre
 * un `CanvasRenderingContext2D` (`dibujarMarcoX(ctx, width, height)`,
 * reunidas acá bajo `drawFrame`), pensada para reusarse tal cual desde dos
 * lugares que deben verse equivalentes pero que no comparten código entre
 * sí:
 *  1. `CameraCapture.handleShoot` la llama sobre el `<canvas>` real de
 *     captura, entre `ctx.drawImage(video, ...)` y `canvas.toBlob(...)` --
 *     ahí es donde el marco queda realmente grabado en el JPEG subido.
 *  2. El preview en vivo (`FrameOverlay` en CameraCapture.tsx) es una capa
 *     DOM/CSS aparte por rendimiento -- no puede llamar a estas funciones,
 *     así que se mantiene visualmente equivalente a mano. No hay forma de
 *     derivar una implementación de la otra automáticamente.
 *
 * Colores tomados directo de tailwind.config.js (mismos hex, no hay forma
 * de leer clases de Tailwind desde un <canvas>).
 */

export type FrameId =
  | 'none'
  | 'neon-corners'
  | 'roll-ticket'
  | 'polaroid'
  | 'laser-grid'
  | 'confetti'
  | 'vinyl'
  | 'typographic';

export const FRAME_IDS: FrameId[] = [
  'none',
  'neon-corners',
  'roll-ticket',
  'polaroid',
  'laser-grid',
  'confetti',
  'vinyl',
  'typographic',
];

export const FRAME_LABELS: Record<FrameId, string> = {
  none: 'Sin marco',
  'neon-corners': 'Esquinas neón',
  'roll-ticket': 'Ticket de carrete',
  polaroid: 'Polaroid',
  'laser-grid': 'Grid láser',
  confetti: 'Confeti',
  vinyl: 'Vinilo',
  typographic: 'Tipográfico',
};

const HOTPINK = '#ff2f92';
const ACID = '#c8ff3d';
const LASER = '#00e6d8';
const FLAME = '#ff5a1f';
const PAPER = '#f3ecf7';
const INK_950 = '#0d0b12';

/**
 * Navegación pura entre marcos dado un swipe -- lo único de la interacción
 * de marcos que es testable sin un gesto táctil real (ver
 * CameraCapture.tsx para el handler que la usa). Circular: swipe repetido
 * en el mismo sentido da la vuelta al carrusel en vez de trabarse en la
 * punta.
 */
export function getFrameIndexAfterSwipe(
  currentIndex: number,
  direction: 'left' | 'right',
  frameCount: number,
): number {
  if (frameCount <= 1) return 0;
  const delta = direction === 'left' ? 1 : -1;
  return (currentIndex + delta + frameCount) % frameCount;
}

export function drawFrame(ctx: CanvasRenderingContext2D, frameId: FrameId, width: number, height: number): void {
  switch (frameId) {
    case 'none':
      return;
    case 'neon-corners':
      return drawNeonCorners(ctx, width, height);
    case 'roll-ticket':
      return drawRollTicket(ctx, width, height);
    case 'polaroid':
      return drawPolaroid(ctx, width, height);
    case 'laser-grid':
      return drawLaserGrid(ctx, width, height);
    case 'confetti':
      return drawConfetti(ctx, width, height);
    case 'vinyl':
      return drawVinyl(ctx, width, height);
    case 'typographic':
      return drawTypographic(ctx, width, height);
  }
}

// (1) Esquinas neón -- evolución "quemada" del FramingGuide decorativo en
// hotpink: cuatro brackets en L, más gruesos y largos que la guía sutil de
// encuadre, para que se note que es un marco real y no solo la guía.
function drawNeonCorners(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const len = Math.min(width, height) * 0.14;
  const inset = Math.min(width, height) * 0.03;
  const lw = Math.max(4, Math.min(width, height) * 0.012);
  ctx.save();
  ctx.strokeStyle = HOTPINK;
  ctx.lineWidth = lw;
  const corners: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [width - inset, inset, -1, 1],
    [inset, height - inset, 1, -1],
    [width - inset, height - inset, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + len * dy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len * dx, y);
    ctx.stroke();
  }
  ctx.restore();
}

// (2) Ticket de carrete -- franja inferior tipo ticket con el nombre del
// evento y la fecha, como el borde impreso de un rollo de fotos revelado.
function drawRollTicket(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const stripHeight = Math.max(36, height * 0.1);
  ctx.save();
  ctx.fillStyle = INK_950;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, height - stripHeight, width, stripHeight);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAPER;
  ctx.font = `${Math.max(14, stripHeight * 0.36)}px "Space Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FCUMPLE // 09.10.26', width / 2, height - stripHeight / 2);
  ctx.restore();
}

// (3) Polaroid clásico -- borde blanco grueso, más ancho abajo que en los
// otros tres lados.
function drawPolaroid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const side = Math.max(10, Math.min(width, height) * 0.045);
  const bottom = side * 3.2;
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, side); // top
  ctx.fillRect(0, height - bottom, width, bottom); // bottom, más ancho
  ctx.fillRect(0, 0, side, height); // left
  ctx.fillRect(width - side, 0, side, height); // right
  ctx.restore();
}

// (4) Grid láser -- líneas finas tipo escáner en las cuatro esquinas, sin
// tapar el centro de la foto.
function drawLaserGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const size = Math.min(width, height) * 0.16;
  const gap = size / 3;
  ctx.save();
  ctx.strokeStyle = LASER;
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.003);
  const originsX = [0, width];
  const originsY = [0, height];
  for (const ox of originsX) {
    for (const oy of originsY) {
      const sx = ox === 0 ? 1 : -1;
      const sy = oy === 0 ? 1 : -1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(ox, oy + sy * gap * i);
        ctx.lineTo(ox + sx * size, oy + sy * gap * i);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// (5) Confeti de cumpleaños -- formas pequeñas dispersas SOLO en las
// esquinas (posiciones relativas fijas, no aleatorias, para que el marco
// se vea igual foto tras foto y sea determinístico para tests).
const CONFETTI_SPOTS: { rx: number; ry: number; color: string; shape: 'rect' | 'circle' }[] = [
  { rx: 0.04, ry: 0.06, color: HOTPINK, shape: 'circle' },
  { rx: 0.09, ry: 0.03, color: ACID, shape: 'rect' },
  { rx: 0.03, ry: 0.12, color: LASER, shape: 'rect' },
  { rx: 0.96, ry: 0.05, color: FLAME, shape: 'circle' },
  { rx: 0.91, ry: 0.09, color: HOTPINK, shape: 'rect' },
  { rx: 0.97, ry: 0.14, color: ACID, shape: 'circle' },
  { rx: 0.05, ry: 0.92, color: LASER, shape: 'circle' },
  { rx: 0.1, ry: 0.96, color: FLAME, shape: 'rect' },
  { rx: 0.94, ry: 0.94, color: HOTPINK, shape: 'rect' },
  { rx: 0.9, ry: 0.9, color: ACID, shape: 'circle' },
];

function drawConfetti(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const size = Math.max(6, Math.min(width, height) * 0.02);
  ctx.save();
  for (const spot of CONFETTI_SPOTS) {
    const x = spot.rx * width;
    const y = spot.ry * height;
    ctx.fillStyle = spot.color;
    if (spot.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }
  ctx.restore();
}

// (6) Vinilo/DJ -- semicírculo sutil tipo disco en la esquina inferior
// derecha, coherente con el tono "crossfader de DJ" del resto de la app
// (ver FaderToggle.tsx).
function drawVinyl(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const r = Math.min(width, height) * 0.22;
  const cx = width;
  const cy = height;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = INK_950;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, Math.PI * 1.5);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = ACID;
  ctx.lineWidth = Math.max(2, r * 0.03);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = ACID;
  ctx.fill();
  ctx.restore();
}

// (7) Tipográfico -- nombre discreto en una esquina, font-display del
// proyecto (Anton, con fallback porque un <canvas> no siempre tiene la
// tipografía web cargada al momento de dibujar).
function drawTypographic(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const size = Math.max(16, Math.min(width, height) * 0.045);
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.font = `${size}px Anton, Impact, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('FABRIZIO // 26', size * 0.6, height - size * 0.6);
  ctx.restore();
}
