import { useEffect, useMemo, useState } from 'react';
import { listGuests, createGuest, updateGuest, deleteGuest } from '../lib/adminApi';
import { signOut } from '../lib/auth';
import { getEventConfig } from '../lib/eventApi';
import type { EventConfig, Guest } from '../types';
import HeadcountMeter from '../components/HeadcountMeter';
import DoorList from '../components/DoorList';
import GuestEditModal from '../components/GuestEditModal';
import CreateGuestModal from '../components/CreateGuestModal';
import SignalToast from '../components/SignalToast';
import EventSettingsForm from '../components/EventSettingsForm';
import ExportGuestsButton from '../components/ExportGuestsButton';
import ImportGuestsModal from '../components/ImportGuestsModal';

/**
 * /admin — la consola de la puerta.
 * Compone HeadcountMeter + DoorList como módulos de una misma mesa de
 * control, no como cards flotantes independientes.
 */
export default function AdminPage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const [showEventSettings, setShowEventSettings] = useState(false);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);

  useEffect(() => {
    let active = true;
    getEventConfig()
      .then((config) => active && setEventConfig(config))
      .catch(() => {
        /* the header degrades to "sin definir" below; the toast is reserved
           for the guest list load, which is the primary data of this page */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listGuests()
      .then((list) => active && setGuests(list))
      .catch((err) => {
        if (!active) return;
        setToastKind('error');
        setToast(err instanceof Error ? err.message : 'No pudimos cargar la lista de invitados.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const confirmed = useMemo(() => guests.filter((g) => g.status === 'confirmed').length, [guests]);
  const pending = useMemo(() => guests.filter((g) => g.status === 'pending').length, [guests]);
  const declined = useMemo(() => guests.filter((g) => g.status === 'declined').length, [guests]);

  function notifyError(action: string, err: unknown) {
    setToastKind('error');
    setToast(err instanceof Error ? err.message : `No pudimos ${action}.`);
  }

  async function handleCreate(input: { fullName: string; plusOnesAllowed: number }) {
    try {
      const created = await createGuest(input);
      setGuests((prev) => [...prev, created]);
      setCreating(false);
      setToastKind('success');
      setToast('Invitado agregado a la lista');
    } catch (err) {
      notifyError('crear el invitado', err);
    }
  }

  async function handleSave(draft: Guest) {
    try {
      const updated = await updateGuest(draft.id, {
        fullName: draft.fullName,
        status: draft.status,
        plusOnesAllowed: draft.plusOnesAllowed,
        adminNote: draft.adminNote,
      });
      setGuests((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      setEditingGuest(null);
      setToastKind('success');
      setToast('Ficha actualizada // aplicado al rack');
    } catch (err) {
      notifyError('actualizar el invitado', err);
    }
  }

  async function handleDelete(guestId: string) {
    try {
      await deleteGuest(guestId);
      setGuests((prev) => prev.filter((g) => g.id !== guestId));
      setEditingGuest(null);
      setToastKind('success');
      setToast('Invitado eliminado de la lista');
    } catch (err) {
      notifyError('eliminar el invitado', err);
    }
  }

  async function handleLogout() {
    await signOut();
  }

  function handleImported(created: Guest[]) {
    setGuests((prev) => [...prev, ...created]);
    setToastKind('success');
    setToast(`${created.length} invitado${created.length === 1 ? '' : 's'} importado${created.length === 1 ? '' : 's'}`);
  }

  return (
    <div className="min-h-screen bg-ink-950 text-paper-100">
      <header className="flex items-center justify-between bg-ink-900 px-6 py-4 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-acid-400" aria-hidden />
          <span className="font-display text-lg uppercase tracking-wider text-paper-100">Nocturne</span>
          <span className="ml-2 bg-ink-950 px-2 py-1 font-mono text-[10px] uppercase text-acid-400">
            Deck-01 // live ctrl
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase text-paper-100/70">
          <span>Corte lista: {formatTime(eventConfig?.rsvpDeadline ?? null)}</span>
          <button
            type="button"
            onClick={() => setShowEventSettings((v) => !v)}
            className="border border-smoke-700/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-acid-400 transition-colors hover:bg-acid-400/10"
          >
            Evento
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="border border-smoke-700/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-flame-500 transition-colors hover:bg-flame-500/10"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        {showEventSettings && <EventSettingsForm onSaved={setEventConfig} />}

        <section className="grid grid-cols-1 gap-4 bg-ink-900 p-4 shadow-2xl lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HeadcountMeter confirmed={confirmed} total={guests.length} pending={pending} declined={declined} />
          </div>
          <div className="flex flex-col justify-between gap-2 bg-ink-950 p-4">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-hotpink-500">
              Live tally
            </span>
            <TallyRow color="bg-acid-400" label="Confirmados" value={confirmed} valueClass="text-acid-400" />
            <TallyRow color="bg-laser-500" label="Pendientes" value={pending} valueClass="text-laser-500" />
            <TallyRow color="bg-flame-500" label="Rechazados" value={declined} valueClass="text-flame-500" />
          </div>
        </section>

        <div className="flex items-center justify-end gap-2">
          <ExportGuestsButton guests={guests} />
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="border border-smoke-700/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 transition-colors hover:bg-smoke-700/30"
          >
            Importar CSV
          </button>
        </div>

        <DoorList
          guests={guests}
          loading={loading}
          onEditGuest={setEditingGuest}
          onCreateGuest={() => setCreating(true)}
        />
      </main>

      <GuestEditModal guest={editingGuest} onClose={() => setEditingGuest(null)} onSave={handleSave} onDelete={handleDelete} />

      <CreateGuestModal open={creating} onClose={() => setCreating(false)} onCreate={handleCreate} />

      <ImportGuestsModal open={importing} onClose={() => setImporting(false)} onImported={handleImported} />

      <SignalToast message={toast} kind={toastKind} onDismiss={() => setToast(null)} />
    </div>
  );
}

function TallyRow({
  color,
  label,
  value,
  valueClass,
}: {
  color: string;
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between bg-ink-900 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 ${color}`} aria-hidden />
        <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100">{label}</span>
      </div>
      <span className={`font-display text-xl leading-none ${valueClass}`}>{value}</span>
    </div>
  );
}

function formatTime(iso: string | null) {
  if (!iso) return 'sin definir';
  try {
    const time = new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return time === 'Invalid Date' ? 'sin definir' : time;
  } catch {
    return 'sin definir';
  }
}
