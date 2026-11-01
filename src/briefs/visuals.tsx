import FramePreview from '../components/studio/FramePreview';
import { FONT_STACKS, defaultFrameParams, type FrameFont, type FrameParams } from '../lib/cameraAssets/frames';
import type { BriefFrame, BriefOption, BriefPalette, BriefQuestion } from './types';

/** Lo que ya eligió la persona y alimenta las vistas previas de las demás preguntas. */
export interface BriefContext {
  palette: BriefPalette;
  font: FrameFont;
  name: string;
  date: string;
}

export const DEFAULT_PALETTE: BriefPalette = {
  bg: '#16121d',
  accent: '#f3ecf7',
  soft: '#3a3244',
  text: '#f3ecf7',
};

export const DEFAULT_FONT: FrameFont = 'display';

// Tamaño con que se muestran las vistas de marcos; el dibujo a medida trabaja en un lienzo de 108 x 144.
const SAMPLE_W = 150;
const SAMPLE_H = 200;
const VIEW_W = 108;
const VIEW_H = 144;

/** Antifaz con dos huecos para los ojos, centrado en (cx, cy), de ancho `w`. */
function maskPath(cx: number, cy: number, w: number): string {
  const k = w / 68;
  const x = (v: number) => (cx + (v - 50) * k).toFixed(2);
  const y = (v: number) => (cy + (v - 62) * k).toFixed(2);
  return `M${x(16)} ${y(62)} Q${x(50)} ${y(38)} ${x(84)} ${y(62)} Q${x(74)} ${y(92)} ${x(60)} ${y(76)} Q${x(50)} ${y(84)} ${x(40)} ${y(76)} Q${x(26)} ${y(92)} ${x(16)} ${y(62)}Z`;
}

/** Estrella de cuatro puntas: el destello de las escenas. */
function star(cx: number, cy: number, r: number): string {
  const k = r * 0.28;
  return `M${cx} ${cy - r} L${cx + k} ${cy - k} L${cx + r} ${cy} L${cx + k} ${cy + k} L${cx} ${cy + r} L${cx - k} ${cy + k} L${cx - r} ${cy} L${cx - k} ${cy - k} Z`;
}

/** Escena mínima de un ambiente, dibujada con la paleta elegida. */
function Scene({ id, palette }: { id: string; palette: BriefPalette }) {
  const { bg, accent, soft, text } = palette;
  const gradientId = `scene-bg-${id}`;
  return (
    <svg viewBox="0 0 100 130" className="block w-full" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={soft} />
          <stop offset="1" stopColor={bg} />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill={`url(#${gradientId})`} />
      {id === 'meangirls' && (
        <>
          <ellipse cx="36" cy="30" rx="7" ry="21" fill={accent} transform="rotate(-12 36 30)" />
          <ellipse cx="36" cy="30" rx="3" ry="15" fill={soft} transform="rotate(-12 36 30)" />
          <ellipse cx="64" cy="30" rx="7" ry="21" fill={accent} transform="rotate(12 64 30)" />
          <ellipse cx="64" cy="30" rx="3" ry="15" fill={soft} transform="rotate(12 64 30)" />
          <circle cx="50" cy="70" r="22" fill={text} opacity="0.18" />
          <path d={maskPath(50, 68, 40)} fill={accent} />
          <ellipse cx="42" cy="68" rx="4.5" ry="3" fill={bg} />
          <ellipse cx="58" cy="68" rx="4.5" ry="3" fill={bg} />
          <path d={star(18, 62, 6)} fill={text} />
          <path d={star(84, 48, 5)} fill={text} />
          <path d={star(78, 96, 7)} fill={accent} />
          <path d={star(22, 100, 4)} fill={text} />
          <path d="M50 118 C36 108 40 98 50 104 C60 98 64 108 50 118Z" fill={accent} />
        </>
      )}
      {id === 'club' && (
        <>
          <polygon points="50,0 22,100 46,100" fill={accent} opacity="0.28" />
          <polygon points="50,0 54,100 80,100" fill={accent} opacity="0.2" />
          <polygon points="50,0 36,100 64,100" fill={text} opacity="0.1" />
          {[0, 1, 2, 3].map((row) =>
            [0, 1, 2, 3, 4].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={col * 20 + 1}
                y={100 + row * 8}
                width="18"
                height="7"
                fill={(row + col) % 2 ? accent : soft}
                opacity="0.45"
              />
            )),
          )}
          <circle cx="50" cy="14" r="7" fill={text} opacity="0.85" />
        </>
      )}
      {id === 'gala' && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect key={`l${i}`} x={i * 6} y="0" width="5" height="130" fill={accent} opacity={0.25 + i * 0.08} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <rect key={`r${i}`} x={100 - (i + 1) * 6} y="0" width="5" height="130" fill={accent} opacity={0.25 + i * 0.08} />
          ))}
          <ellipse cx="50" cy="70" rx="24" ry="44" fill={text} opacity="0.12" />
          <path d="M42 90 Q50 60 58 90 Z" fill={accent} />
          <circle cx="50" cy="56" r="7" fill={accent} />
          <path d={star(50, 22, 7)} fill={text} />
        </>
      )}
      {id === 'mascarada' && (
        <>
          <path d={maskPath(50, 62, 68)} fill={accent} />
          <ellipse cx="36" cy="64" rx="8" ry="5" fill={bg} />
          <ellipse cx="64" cy="64" rx="8" ry="5" fill={bg} />
          <path d="M84 62 Q96 40 92 24 Q84 44 78 54Z" fill={text} opacity="0.8" />
          <path d={star(20, 24, 6)} fill={text} />
          <path d={star(80, 108, 6)} fill={accent} />
          <path d={star(30, 104, 4)} fill={text} />
        </>
      )}
      {id === 'retro' && (
        <>
          {Array.from({ length: 22 }, (_, i) => (
            <rect key={i} x="0" y={i * 6} width="100" height="1.5" fill={text} opacity="0.1" />
          ))}
          <circle cx="14" cy="14" r="4" fill={accent} />
          <text x="22" y="18" fontSize="9" fill={text} fontFamily="'Space Mono', ui-monospace, monospace">
            REC
          </text>
          <rect x="10" y="92" width="52" height="5" fill={accent} opacity="0.7" />
          <rect x="30" y="102" width="60" height="3" fill={text} opacity="0.45" />
          <text x="10" y="122" fontSize="9" fill={text} fontFamily="'Space Mono', ui-monospace, monospace">
            PLAY ▶
          </text>
        </>
      )}
    </svg>
  );
}

/** Propuesta a medida (aún no existe como plantilla de la cámara) sobre el mismo fondo de ejemplo de FramePreview. */
function BunnyFrame({ ctx }: { ctx: BriefContext }) {
  const { accent, bg, text, soft } = ctx.palette;
  const label = ctx.name || 'Martina';
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={SAMPLE_W}
      height={SAMPLE_H}
      role="img"
      aria-label="Propuesta a medida: marco con orejas de conejita y antifaz"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="bunny-photo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7aa7ff" />
          <stop offset="1" stopColor="#ffb199" />
        </linearGradient>
      </defs>
      <rect width={VIEW_W} height={VIEW_H} fill="url(#bunny-photo)" />
      <circle cx="54" cy="64" r="21" fill="#fff" opacity="0.35" />
      <ellipse cx="54" cy="118" rx="34" ry="24" fill="#fff" opacity="0.35" />
      <rect x="3" y="3" width={VIEW_W - 6} height={VIEW_H - 6} rx="6" fill="none" stroke={accent} strokeWidth="5" />
      <ellipse cx="36" cy="16" rx="7" ry="20" fill={accent} stroke={bg} strokeWidth="1.5" transform="rotate(-10 36 16)" />
      <ellipse cx="36" cy="16" rx="3" ry="14" fill={soft} transform="rotate(-10 36 16)" />
      <ellipse cx="72" cy="16" rx="7" ry="20" fill={accent} stroke={bg} strokeWidth="1.5" transform="rotate(10 72 16)" />
      <ellipse cx="72" cy="16" rx="3" ry="14" fill={soft} transform="rotate(10 72 16)" />
      <path d={maskPath(54, 62, 40)} fill={accent} stroke={bg} strokeWidth="1" />
      <ellipse cx="46" cy="62" rx="4.5" ry="3" fill={bg} />
      <ellipse cx="62" cy="62" rx="4.5" ry="3" fill={bg} />
      <rect x="12" y="122" width="84" height="16" rx="3" fill={accent} />
      <text x="54" y="133" textAnchor="middle" fontSize="10" fill={bg} fontFamily={FONT_STACKS[ctx.font]}>
        {label}
      </text>
      <path d="M8 120 C0 112 4 106 8 110 C12 106 16 112 8 120Z" fill={text} />
    </svg>
  );
}

/** Parámetros reales de la cámara para el marco de ejemplo, con el nombre elegido. */
function frameParams(_frame: Exclude<BriefFrame, 'conejita'>, ctx: BriefContext): FrameParams {
  return defaultFrameParams('capas', { eventName: ctx.name || 'Martina' });
}

/** Dibuja la vista previa de una opción según `question.visual`; sin `visual`, no dibuja nada. */
export function OptionVisual({
  question,
  option,
  ctx,
}: {
  question: BriefQuestion;
  option: BriefOption;
  ctx: BriefContext;
}) {
  switch (question.visual) {
    case 'palette': {
      const p = option.palette ?? DEFAULT_PALETTE;
      return (
        <span className="flex w-full items-stretch gap-1" aria-hidden>
          <span
            className="flex h-12 flex-1 items-center justify-center font-display text-xl"
            style={{ backgroundColor: p.bg, color: p.accent }}
          >
            Aa
          </span>
          {[p.accent, p.soft, p.text].map((c, i) => (
            <span key={i} className="h-12 w-6 border border-paper-100/20" style={{ backgroundColor: c }} />
          ))}
        </span>
      );
    }
    case 'font':
      return (
        <span
          className="flex min-h-[64px] w-full flex-col justify-center px-3 py-2"
          style={{ backgroundColor: ctx.palette.bg, color: ctx.palette.accent, fontFamily: FONT_STACKS[option.font ?? 'sans'] }}
          aria-hidden
        >
          <span className="text-2xl leading-tight">{ctx.name || 'Martina'}</span>
          <span className="text-xs" style={{ color: ctx.palette.text }}>
            {ctx.date || 'Tu fecha'}
          </span>
        </span>
      );
    case 'ambiente':
      return (
        <span className="block w-full max-w-[140px]" aria-hidden>
          <Scene id={option.id} palette={ctx.palette} />
        </span>
      );
    case 'frame':
      if (!option.frame) return null;
      return option.frame === 'conejita' ? (
        <BunnyFrame ctx={ctx} />
      ) : (
        <FramePreview
          template={option.frame}
          params={frameParams(option.frame, ctx)}
          width={SAMPLE_W}
          height={SAMPLE_H}
          label={`Vista previa: ${option.label}`}
        />
      );
    case 'emoji':
      return (
        <span className="text-3xl leading-none" aria-hidden>
          {option.glyphs}
        </span>
      );
    case 'roll':
      return (
        <span className="flex w-full flex-wrap items-center gap-1 bg-ink-950 p-2" aria-hidden>
          {/^\d+$/.test(option.id) ? (
            Array.from({ length: Number(option.id) }, (_, i) => (
              <span key={i} className="h-5 w-3.5 border" style={{ backgroundColor: ctx.palette.accent, borderColor: ctx.palette.soft }} />
            ))
          ) : (
            <span className="font-mono text-2xl font-bold" style={{ color: ctx.palette.accent }}>
              ?
            </span>
          )}
        </span>
      );
    default:
      return null;
  }
}
