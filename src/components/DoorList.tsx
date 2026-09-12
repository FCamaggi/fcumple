import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import type { Guest, RsvpStatus } from '../types';
import NoteChip from './NoteChip';
import { STATUS_FLASH_COLOR, shouldFlashOnStatusChange } from '../lib/statusFlash';

// Colores base de zebra-striping de la tabla (bg-ink-950 / bg-ink-900 al 60%),
// usados para devolver la fila a su estado de reposo tras el flash sin pisar
// el hover de Tailwind con un estilo inline permanente.
const ROW_BASE_COLOR = ['#0d0b12', 'rgba(22, 18, 29, 0.6)'];

type FilterTab = 'all' | RsvpStatus;

interface DoorListProps {
  guests: Guest[];
  loading?: boolean;
  onEditGuest: (guest: Guest) => void;
  onCreateGuest?: () => void;
}

const STATUS_CHIP: Record<RsvpStatus, string> = {
  confirmed: 'bg-acid-400 text-ink-950',
  pending: 'bg-laser-500 text-ink-950',
  declined: 'bg-flame-500/80 text-ink-950',
};

const STATUS_LABEL: Record<RsvpStatus, string> = {
  confirmed: 'Confirmado',
  pending: 'Pendiente',
  declined: 'Rechazado',
};

/**
 * DoorList — la tabla de invitados del admin.
 * Formato de lista de guardia de puerta: chips de color sólido para estado,
 * "+N" para acompañantes, filtros como pestañas de clipboard.
 */
export default function DoorList({ guests, loading = false, onEditGuest, onCreateGuest }: DoorListProps) {
  const [tab, setTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(
    () => ({
      all: guests.length,
      confirmed: guests.filter((g) => g.status === 'confirmed').length,
      pending: guests.filter((g) => g.status === 'pending').length,
      declined: guests.filter((g) => g.status === 'declined').length,
    }),
    [guests],
  );

  const filtered = useMemo(() => {
    return guests.filter((g) => {
      if (tab !== 'all' && g.status !== tab) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return g.fullName.toLowerCase().includes(q) || (g.token ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [guests, tab, search]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'confirmed', label: 'Confirmados' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'declined', label: 'Rechazados' },
  ];

  return (
    <section className="flex flex-col gap-4 bg-ink-900 p-4 shadow-2xl">
      <div className="flex flex-col justify-between gap-4 px-1 xl:flex-row xl:items-center">
        <div className="flex flex-wrap items-center gap-1 bg-ink-950 p-1 shadow-inner">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                tab === t.key
                  ? 'bg-acid-400 text-ink-950 shadow-glow-acid'
                  : 'bg-ink-900 text-paper-100 hover:bg-smoke-700/40'
              }`}
            >
              <span>{t.label}</span>
              <span className="bg-ink-950/40 px-1 text-[10px]">{counts[t.key]}</span>
            </button>
          ))}
        </div>

        <div className="flex w-full items-center gap-2 bg-ink-950 px-3 py-2 shadow-inner xl:w-96">
          <span className="font-mono text-laser-500" aria-hidden>
            ⌕
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o token..."
            className="w-full bg-transparent font-mono text-xs uppercase tracking-wider text-paper-100 placeholder-smoke-700 outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-1 bg-ink-950 p-3 shadow-inner">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-smoke-700/20" />
          ))}
        </div>
      ) : guests.length === 0 ? (
        <EmptyState onCreateGuest={onCreateGuest} />
      ) : filtered.length === 0 ? (
        <EmptyState noResults />
      ) : (
        <div className="w-full overflow-x-auto bg-ink-950 shadow-inner">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="bg-smoke-700/20 font-mono text-[11px] uppercase tracking-widest text-paper-100/70">
                <th className="px-4 py-2">Token / hora</th>
                <th className="px-4 py-2">Invitado</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Puerta</th>
                <th className="px-4 py-2 text-center">+N</th>
                <th className="px-4 py-2">Nota</th>
                <th className="px-4 py-2 text-right">Mando</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest, i) => (
                <DoorListRow key={guest.id} guest={guest} index={i} onEditGuest={onEditGuest} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface DoorListRowProps {
  guest: Guest;
  index: number;
  onEditGuest: (guest: Guest) => void;
}

/**
 * Una fila de DoorList. Detecta cambios de `status` respecto del render
 * anterior y destella brevemente en el color del nuevo estado — "luz de
 * aviso en una consola" (DESIGN.md 6.2). Con prefers-reduced-motion, el
 * destello se reemplaza por un corte duro de color, sin tween (DESIGN.md 11).
 */
function DoorListRow({ guest, index, onEditGuest }: DoorListRowProps) {
  const reduceMotion = useReducedMotion();
  const controls = useAnimationControls();
  const rowRef = useRef<HTMLTableRowElement>(null);
  const prevStatusRef = useRef<RsvpStatus>(guest.status);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = guest.status;

    if (!shouldFlashOnStatusChange(prevStatus, guest.status)) return;

    const restColor = ROW_BASE_COLOR[index % 2];
    const clearInlineColor = () => {
      if (rowRef.current) rowRef.current.style.backgroundColor = '';
    };

    if (reduceMotion) {
      controls.set({ backgroundColor: STATUS_FLASH_COLOR[guest.status] });
      const timeout = setTimeout(clearInlineColor, 150);
      return () => clearTimeout(timeout);
    }

    controls
      .start({
        backgroundColor: [STATUS_FLASH_COLOR[guest.status], restColor],
        transition: { duration: 0.9, ease: 'easeOut' },
      })
      .then(clearInlineColor);
    return undefined;
  }, [guest.status, index, reduceMotion, controls]);

  return (
    <motion.tr
      ref={rowRef}
      initial={false}
      animate={controls}
      className={`transition-colors ${index % 2 === 0 ? 'bg-ink-950' : 'bg-ink-900/60'} hover:bg-smoke-700/20`}
    >
      <td className="px-4 py-3 align-top">
        <div className="flex flex-col">
          <span className="font-mono text-xs text-laser-500">{guest.token ?? guest.id}</span>
          <span className="font-mono text-[11px] text-paper-100/70">{formatTime(guest.createdAt)}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <span
          className={`font-sans text-sm font-bold uppercase text-paper-100 ${
            guest.status === 'declined' ? 'line-through opacity-60' : ''
          }`}
        >
          {guest.fullName}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <span
          className={`inline-block px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider ${
            STATUS_CHIP[guest.status]
          }`}
        >
          {STATUS_LABEL[guest.status]}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <CheckInChip checkedInAt={guest.checkedInAt} />
      </td>
      <td className="px-4 py-3 text-center align-top">
        <span className="font-display text-lg leading-none text-acid-400">
          +{guest.plusOnesConfirmed}
          <span className="ml-1 font-mono text-[10px] text-paper-100/70">/ {guest.plusOnesAllowed}</span>
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <NoteChip text={guest.guestNote ?? ''} />
      </td>
      <td className="px-4 py-3 text-right align-top">
        <button
          type="button"
          onClick={() => onEditGuest(guest)}
          className="bg-smoke-700/30 px-2 py-1 font-mono text-[11px] font-bold uppercase text-paper-100 transition-colors hover:bg-smoke-700/50"
        >
          Editar
        </button>
      </td>
    </motion.tr>
  );
}

/**
 * CheckInChip — indicador de "llegó a la puerta" (checked_in_at, Etapa 3),
 * un dato distinto y adicional al chip de estado de RSVP: alguien puede
 * estar Confirmado y todavía no haber llegado, o (raro, pero no bloqueado)
 * llegar sin haber respondido. Usa un símbolo + texto propio, nunca solo
 * color, para no depender de la percepción de color (DESIGN.md §11).
 */
function CheckInChip({ checkedInAt }: { checkedInAt: string | null }) {
  if (!checkedInAt) {
    return <span className="font-mono text-[11px] text-paper-100/40">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 bg-hotpink-500/10 px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-hotpink-500">
      <span aria-hidden>●</span>
      En la puerta // {formatTime(checkedInAt)}
    </span>
  );
}

function EmptyState({ onCreateGuest, noResults = false }: { onCreateGuest?: () => void; noResults?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 bg-ink-950 px-4 py-16 text-center">
      <span className="font-mono text-[11px] uppercase tracking-widest text-acid-400">
        {noResults ? 'Sin coincidencias' : 'Bitácora en espera'}
      </span>
      <h3 className="max-w-2xl font-display text-3xl uppercase leading-tight text-paper-100">
        {noResults
          ? 'Nadie en la lista calza con este filtro'
          : 'Todavía no hay nadie en la lista — agregá tu primer invitado'}
      </h3>
      <p className="max-w-xl font-sans text-sm text-paper-100/70">
        {noResults
          ? 'Probá otro nombre, folio o pestaña de estado.'
          : 'El evento está configurado y el enlace maestro está listo para recibir confirmaciones.'}
      </p>
      {!noResults && (
        <button
          type="button"
          onClick={onCreateGuest}
          className="mt-2 bg-acid-400 px-6 py-2 font-mono text-xs font-bold uppercase tracking-wider text-ink-950 shadow-glow-acid transition-transform active:scale-95"
        >
          + Agregar primer invitado
        </button>
      )}
    </div>
  );
}

function formatTime(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
