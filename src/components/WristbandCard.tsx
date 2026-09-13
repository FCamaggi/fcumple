import { motion, useReducedMotion } from 'framer-motion';
import type { Guest, EventInfo } from '../types';

interface WristbandCardProps {
  guest: Guest;
  event: EventInfo;
  /** Compact renders just the pass header, without the stub/barcode section — used post-confirmation. */
  compact?: boolean;
}

/**
 * WristbandCard — la tarjeta de invitación.
 * Formato de pulsera/entrada de acceso: borde perforado en un extremo,
 * nombre en Display grande, token en mono como código de acceso.
 */
export default function WristbandCard({ guest, event, compact = false }: WristbandCardProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={
        reduceMotion
          ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
          : { opacity: 0, scale: 0.96, filter: 'blur(6px)' }
      }
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full"
    >
      <div className="absolute inset-0 -z-10 scale-[0.98] rounded bg-hotpink-500/25 blur-2xl" aria-hidden />
      <div className="relative flex w-full flex-col overflow-hidden rounded bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between bg-ink-950 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="bg-ink-900 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-acid-400">
              GUEST PASS
            </span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-paper-100/70">Lista privada</span>
          </div>
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-hotpink-500">
            Folio {(guest.token ?? guest.id).toUpperCase()}
          </span>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="font-mono text-[11px] uppercase tracking-widest text-paper-100/70">Invitado nominal</span>
              <span className="font-sans text-sm font-bold text-paper-100/70">Código intransferible</span>
            </div>
            <div className="flex items-center gap-1 bg-ink-950 px-2 py-0.5">
              <span className="font-mono text-[11px] text-acid-400">Validado</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded bg-ink-950 p-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">
              // Invitación exclusiva para
            </span>
            <h1 className="break-words font-display text-4xl uppercase leading-none tracking-tight text-paper-100 sm:text-5xl">
              {guest.fullName}
            </h1>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">Pasaporte underground</span>
              {guest.plusOnesAllowed > 0 && (
                <span className="font-mono text-[11px] font-bold text-acid-400">
                  Cupo: +{guest.plusOnesAllowed} incluido
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded bg-ink-950/60 p-3">
            <Spec label="Evento" value={event.name} sub={event.tagline} />
            <Spec label="Fecha" value={event.date} sub="Edición aniversario" accent="text-acid-400" />
            <Spec label="Horario" value={`Puertas ${event.doorsTime}`} sub={`Corte: ${formatDeadlineTime(event.rsvpDeadline)}`} accentSub="text-flame-500" />
          </div>
        </div>

        {!compact && (
          <>
            <div className="perforation relative h-6 bg-ink-950" aria-hidden />
            <div className="flex flex-col gap-2 bg-ink-950 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-acid-400">
                  Talón de control
                </span>
                <span className="rounded bg-flame-500/15 px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-flame-500">
                  +18 only
                </span>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
                Te van a reconocer con tu link personal en la puerta.
              </p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function Spec({
  label,
  value,
  sub,
  accent,
  accentSub,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  accentSub?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-wider text-paper-100/70">{label}</span>
      <span className={`font-sans text-sm font-bold uppercase tracking-tight text-paper-100 ${accent ?? ''}`}>{value}</span>
      {sub && <span className={`font-mono text-[10px] ${accentSub ?? 'text-laser-500'}`}>{sub}</span>}
    </div>
  );
}

function formatDeadlineTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
