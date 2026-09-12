import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Guest, RsvpStatus } from '../types';
import NoteChip from './NoteChip';

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
                <th className="px-4 py-2 text-center">+N</th>
                <th className="px-4 py-2">Nota</th>
                <th className="px-4 py-2 text-right">Mando</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest, i) => (
                <motion.tr
                  key={guest.id}
                  initial={false}
                  className={`transition-colors ${i % 2 === 0 ? 'bg-ink-950' : 'bg-ink-900/60'} hover:bg-smoke-700/20`}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
