import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface CreateGuestModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { fullName: string; plusOnesAllowed: number }) => void;
}

/**
 * Alta de invitado — formulario mínimo (nombre + cupo), consistente con la
 * paleta/tipografía del resto del admin.
 */
export default function CreateGuestModal({ open, onClose, onCreate }: CreateGuestModalProps) {
  const [fullName, setFullName] = useState('');
  const [plusOnesAllowed, setPlusOnesAllowed] = useState(0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    onCreate({ fullName: fullName.trim(), plusOnesAllowed });
    setFullName('');
    setPlusOnesAllowed(0);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="flex w-full max-w-sm flex-col gap-4 border border-smoke-700/50 bg-ink-900 p-6 shadow-2xl"
          >
            <span className="font-mono text-[11px] uppercase tracking-widest text-acid-400">Alta de invitado</span>

            <div className="flex flex-col gap-1">
              <label htmlFor="new-guest-name" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
                Nombre completo
              </label>
              <input
                id="new-guest-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="new-guest-plusones" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
                Cupo de acompañantes
              </label>
              <input
                id="new-guest-plusones"
                type="number"
                min={0}
                value={plusOnesAllowed}
                onChange={(e) => setPlusOnesAllowed(Math.max(0, Number(e.target.value)))}
                className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-smoke-700/30 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-paper-100 hover:bg-smoke-700/50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 bg-acid-400 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950 shadow-glow-acid active:scale-95"
              >
                Crear
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
