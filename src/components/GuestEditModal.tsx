import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Guest, RsvpStatus } from '../types';

interface GuestEditModalProps {
  guest: Guest | null;
  onClose: () => void;
  onSave: (guest: Guest) => void;
  onDelete: (guestId: string) => void;
}

const STATUS_OPTIONS: { value: RsvpStatus; label: string; accent: string }[] = [
  { value: 'pending', label: 'Pendiente', accent: 'text-laser-500 border-laser-500' },
  { value: 'confirmed', label: 'Confirmado', accent: 'text-acid-400 border-acid-400' },
  { value: 'declined', label: 'Rechazado', accent: 'text-flame-500 border-flame-500' },
];

/**
 * Modal de edición de invitado ("ficha backstage") dentro del admin.
 * Mapea 1:1 al mock consola_admin_modal_edici_n_de_invitado_ficha_backstage,
 * adaptado al contrato real (sin folio/vip/fast-track, que no existen en la
 * base de datos).
 */
export default function GuestEditModal({ guest, onClose, onSave, onDelete }: GuestEditModalProps) {
  const [draft, setDraft] = useState<Guest | null>(guest);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reset local draft whenever a different guest is opened.
  if (guest && draft?.id !== guest.id) {
    setDraft(guest);
    if (confirmingDelete) setConfirmingDelete(false);
  }

  function handleClose() {
    setConfirmingDelete(false);
    onClose();
  }

  return (
    <AnimatePresence>
      {guest && draft && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/90 p-4 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex w-full max-w-3xl flex-col overflow-hidden border border-smoke-700/50 bg-ink-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-smoke-700/40 bg-ink-950 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-widest text-acid-400">
                  Editar invitado
                </span>
                <span className="font-mono text-[11px] uppercase text-hotpink-500">{draft.token ?? draft.id}</span>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="tap-target flex items-center gap-1 border border-smoke-700/50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-flame-500 transition-colors hover:bg-flame-500/10"
              >
                Cerrar
              </button>
            </div>

            <div className="flex flex-col gap-4 bg-ink-950 p-4">
              <div className="flex flex-col gap-1 border border-smoke-700/40 bg-ink-900 p-4">
                <label
                  htmlFor="guest-fullname"
                  className="font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100"
                >
                  Nombre del invitado
                </label>
                <input
                  id="guest-fullname"
                  type="text"
                  value={draft.fullName}
                  onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                  className="mt-1 w-full border border-acid-400 bg-ink-950 px-3 py-2 font-display text-lg uppercase tracking-wide text-acid-400 shadow-glow-acid outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="flex flex-col justify-between border border-smoke-700/40 bg-ink-900 p-4 md:col-span-7">
                  <div className="mb-2 flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100">
                    <span>Cupo máximo de acompañantes</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 bg-ink-950 p-3">
                    <button
                      type="button"
                      aria-label="Reducir cupo máximo"
                      className="tap-target flex items-center justify-center border border-smoke-700/50 font-display text-xl text-paper-100 active:scale-95"
                      onClick={() =>
                        setDraft({ ...draft, plusOnesAllowed: Math.max(0, draft.plusOnesAllowed - 1) })
                      }
                    >
                      −
                    </button>
                    <div className="flex flex-col items-center">
                      <span className="font-display text-4xl text-acid-400">+{draft.plusOnesAllowed}</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-paper-100/70">
                        Pases extra
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="Aumentar cupo máximo"
                      className="tap-target flex items-center justify-center border border-smoke-700/50 font-display text-xl text-acid-400 shadow-glow-acid active:scale-95"
                      onClick={() => setDraft({ ...draft, plusOnesAllowed: draft.plusOnesAllowed + 1 })}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-3 border border-smoke-700/40 bg-ink-900 p-4 md:col-span-5">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="guest-photo-quota"
                      className="font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100"
                    >
                      Cupo de fotos
                    </label>
                    <input
                      id="guest-photo-quota"
                      type="number"
                      min={0}
                      value={draft.photoQuota ?? 0}
                      onChange={(e) => setDraft({ ...draft, photoQuota: Math.max(0, Number(e.target.value)) })}
                      className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
                    />
                  </div>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100">
                    Estado del RSVP
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={draft.status === opt.value}
                        onClick={() => setDraft({ ...draft, status: opt.value })}
                        className={`border px-2 py-1.5 text-left font-mono text-[11px] font-bold uppercase tracking-wider transition-colors ${
                          draft.status === opt.value ? `${opt.accent} bg-current/10` : 'border-smoke-700/50 text-paper-100/70'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative border-2 border-dashed border-hotpink-500/50 bg-ink-900 p-4">
                <label
                  htmlFor="guest-admin-note"
                  className="absolute -top-3 left-4 bg-hotpink-500 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-ink-950"
                >
                  Nota privada // clasificado cabina
                </label>
                <textarea
                  id="guest-admin-note"
                  rows={2}
                  value={draft.adminNote ?? ''}
                  onChange={(e) => setDraft({ ...draft, adminNote: e.target.value })}
                  placeholder="Nota interna, invisible para el invitado..."
                  className="mt-2 w-full resize-none bg-transparent font-mono text-sm text-hotpink-500 outline-none placeholder-hotpink-500/40"
                />
              </div>
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-smoke-700/40 bg-ink-950 p-4 sm:flex-row">
              <button
                type="button"
                onClick={() => (confirmingDelete ? onDelete(draft.id) : setConfirmingDelete(true))}
                className="tap-target w-full border border-flame-500 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-flame-500 transition-colors hover:bg-flame-500/10 sm:w-auto"
              >
                {confirmingDelete ? '¿Seguro? Tocá de nuevo para eliminar' : 'Eliminar invitado'}
              </button>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={handleClose}
                  className="tap-target flex-1 bg-smoke-700/30 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-paper-100 transition-colors hover:bg-smoke-700/50 sm:flex-none"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={() => onSave(draft)}
                  className="tap-target flex-1 bg-acid-400 px-6 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950 shadow-glow-acid transition-transform active:scale-95 sm:flex-none"
                >
                  Guardar cambios
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
