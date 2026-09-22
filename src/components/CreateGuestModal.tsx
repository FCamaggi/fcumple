import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface CreateGuestModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    fullName: string;
    plusOnesAllowed: number;
    photoQuota: number;
    phone?: string;
    status?: import('../types').RsvpStatus;
    plusOnesConfirmed?: number;
    guestNote?: string;
    adminNote?: string;
  }) => void;
}

// Cupo de fotos por default (Etapa 5, Parte E): 3 disparos propios + uno por
// cada acompañante confirmado. El admin puede pisarlo a mano por invitado
// puntual -- ver `quotaTouched` abajo.
function defaultPhotoQuota(plusOnesAllowed: number): number {
  return 3 + plusOnesAllowed;
}

/**
 * Alta de invitado — formulario mínimo (nombre + cupo + cupo de fotos),
 * consistente con la paleta/tipografía del resto del admin.
 */
export default function CreateGuestModal({ open, onClose, onCreate }: CreateGuestModalProps) {
  const [fullName, setFullName] = useState('');
  const [plusOnesAllowed, setPlusOnesAllowed] = useState(0);
  const [photoQuota, setPhotoQuota] = useState(defaultPhotoQuota(0));
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<import('../types').RsvpStatus>('pending');
  const [plusOnesConfirmed, setPlusOnesConfirmed] = useState(0);
  const [guestNote, setGuestNote] = useState('');
  const [adminNote, setAdminNote] = useState('');
  // Smart default con override manual: mientras el admin no haya tocado el
  // cupo de fotos a mano, se recalcula solo al cambiar plusOnesAllowed. En
  // cuanto lo edita, dejamos de tocarlo automáticamente.
  const [quotaTouched, setQuotaTouched] = useState(false);

  useEffect(() => {
    if (!quotaTouched) {
      setPhotoQuota(defaultPhotoQuota(plusOnesAllowed));
    }
  }, [plusOnesAllowed, quotaTouched]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    const trimmedPhone = phone.trim();
    onCreate({
      fullName: fullName.trim(),
      plusOnesAllowed,
      photoQuota,
      ...(trimmedPhone ? { phone: trimmedPhone } : {}),
      status,
      plusOnesConfirmed,
      ...(guestNote.trim() ? { guestNote: guestNote.trim() } : {}),
      ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
    });
    setFullName('');
    setPlusOnesAllowed(0);
    setPhotoQuota(defaultPhotoQuota(0));
    setQuotaTouched(false);
    setPhone('');
    setStatus('pending');
    setPlusOnesConfirmed(0);
    setGuestNote('');
    setAdminNote('');
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
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value));
                  setPlusOnesAllowed(val);
                  setPlusOnesConfirmed((prev) => Math.min(prev, val));
                }}
                className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="new-guest-photoquota" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
                Cupo de fotos
              </label>
              <input
                id="new-guest-photoquota"
                type="number"
                min={0}
                value={photoQuota}
                onChange={(e) => {
                  setQuotaTouched(true);
                  setPhotoQuota(Math.max(0, Number(e.target.value)));
                }}
                className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="new-guest-phone" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
                Teléfono (WhatsApp, opcional)
              </label>
              <input
                id="new-guest-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+56 9 1234 5678"
                className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
                Estado del RSVP
              </span>
              <div className="flex gap-2">
                {(['pending', 'confirmed', 'declined'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setStatus(opt)}
                    className={`flex-1 border px-2 py-1 text-center font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      status === opt
                        ? opt === 'confirmed'
                          ? 'border-acid-400 bg-acid-400/10 text-acid-400'
                          : opt === 'declined'
                            ? 'border-flame-500 bg-flame-500/10 text-flame-500'
                            : 'border-laser-500 bg-laser-500/10 text-laser-500'
                        : 'border-smoke-700/50 text-paper-100/70'
                    }`}
                  >
                    {opt === 'pending' ? 'Pendiente' : opt === 'confirmed' ? 'Confirmado' : 'Rechazado'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="new-guest-plusonesconfirmed" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
                Acompañantes confirmados
              </label>
              <input
                id="new-guest-plusonesconfirmed"
                type="number"
                min={0}
                max={plusOnesAllowed}
                value={plusOnesConfirmed}
                onChange={(e) => setPlusOnesConfirmed(Math.min(plusOnesAllowed, Math.max(0, Number(e.target.value))))}
                className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="new-guest-note" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
                Nota del invitado
              </label>
              <textarea
                id="new-guest-note"
                value={guestNote}
                onChange={(e) => setGuestNote(e.target.value)}
                rows={2}
                className="resize-none bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="new-guest-admin-note" className="font-mono text-[11px] uppercase tracking-wider text-hotpink-500/70">
                Nota privada
              </label>
              <textarea
                id="new-guest-admin-note"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={2}
                className="resize-none border border-hotpink-500/50 bg-ink-950 px-3 py-2 font-sans text-sm text-hotpink-500 outline-none placeholder-hotpink-500/30"
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
