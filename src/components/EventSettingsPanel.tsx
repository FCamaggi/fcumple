import { useState } from 'react';
import type { AccessMode } from '../lib/platformApi';
import type { CameraUnlock, EventSettingsPatch, OrganizerEvent } from '../lib/organizerApi';
import { isoToLocalInput, localInputToIso } from '../lib/localDateTime';

interface EventSettingsPanelProps {
  event: OrganizerEvent;
  onSave: (patch: EventSettingsPatch) => Promise<void>;
}

const ACCESS_LABELS: Record<AccessMode, string> = {
  open: 'Abierto: cualquiera con el enlace se inscribe',
  list: 'Solo quienes están en mi lista',
  list_requests: 'Mi lista, y quien no está puede pedir acceso',
};

const UNLOCK_LABELS: Record<CameraUnlock, string> = {
  on_identify: 'Al identificarse',
  on_checkin: 'Cuando marque su llegada en la puerta',
};

const fieldClass =
  'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none focus-visible:ring-2 focus-visible:ring-acid-400';
const selectClass = fieldClass;
const labelClass = 'font-mono text-[11px] uppercase tracking-wider text-paper-100/70';

/** Ajustes del evento: nombre, fecha y lugar, cómo entran los invitados, cupo de fotos y cuándo se habilita la cámara. */
export default function EventSettingsPanel({ event, onSave }: EventSettingsPanelProps) {
  const [name, setName] = useState(event.name);
  const [startsAt, setStartsAt] = useState(isoToLocalInput(event.startsAt));
  const [location, setLocation] = useState(event.location ?? '');
  const [photoQuota, setPhotoQuota] = useState(String(event.defaultPhotoQuota));
  const [accessMode, setAccessMode] = useState<AccessMode>(event.accessMode);
  const [cameraUnlock, setCameraUnlock] = useState<CameraUnlock>(event.cameraUnlock);
  const [rsvpEnabled, setRsvpEnabled] = useState(event.rsvpEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!name.trim()) {
      setMessage({ kind: 'error', text: 'El evento necesita un nombre.' });
      return;
    }
    const quota = Number(photoQuota);
    if (photoQuota.trim() === '' || !Number.isInteger(quota) || quota < 0 || quota > 100) {
      setMessage({ kind: 'error', text: 'Las fotos por invitado deben ser un número entero entre 0 y 100.' });
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        // Solo si la tocó: reenviarla en cada guardado reescribiría la fecha (y le quitaría los segundos).
        ...(startsAt !== isoToLocalInput(event.startsAt) ? { startsAt: localInputToIso(startsAt) } : {}),
        location: location.trim() || null,
        defaultPhotoQuota: quota,
        accessMode,
        cameraUnlock,
        rsvpEnabled,
      });
      setMessage({ kind: 'ok', text: 'Ajustes guardados.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No pudimos guardar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-md flex-col gap-4" aria-label="Ajustes del evento">
      <div className="flex flex-col gap-1">
        <label htmlFor="ev-name" className={labelClass}>
          Nombre del evento
        </label>
        <input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ev-starts-at" className={labelClass}>
          Fecha y hora
        </label>
        <input
          id="ev-starts-at"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className={fieldClass}
        />
        <p className="font-sans text-xs text-paper-100/60">
          Es la hora de tu dispositivo. Los invitados la ven en la entrada del evento.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ev-location" className={labelClass}>
          Lugar
        </label>
        <input
          id="ev-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ev-access" className={labelClass}>
          Quién puede entrar
        </label>
        <select
          id="ev-access"
          value={accessMode}
          onChange={(e) => setAccessMode(e.target.value as AccessMode)}
          className={selectClass}
        >
          {(Object.keys(ACCESS_LABELS) as AccessMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {ACCESS_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ev-quota" className={labelClass}>
          Fotos por invitado
        </label>
        <input
          id="ev-quota"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={photoQuota}
          onChange={(e) => setPhotoQuota(e.target.value)}
          className={fieldClass}
        />
        <p className="font-sans text-xs text-paper-100/60">
          Se aplica a quienes se inscriban desde ahora; no cambia el cupo de quienes ya están inscritos.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ev-unlock" className={labelClass}>
          La cámara se habilita
        </label>
        <select
          id="ev-unlock"
          value={cameraUnlock}
          onChange={(e) => setCameraUnlock(e.target.value as CameraUnlock)}
          className={selectClass}
        >
          {(Object.keys(UNLOCK_LABELS) as CameraUnlock[]).map((mode) => (
            <option key={mode} value={mode}>
              {UNLOCK_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 font-sans text-sm text-paper-100">
        <input type="checkbox" checked={rsvpEnabled} onChange={(e) => setRsvpEnabled(e.target.checked)} />
        Pedir confirmación de asistencia (RSVP)
      </label>

      <p className="font-sans text-xs text-paper-100/60">
        Cada invitado se inscribe con su nombre y apellido y un PIN que elige él mismo. No se pide RUT, correo ni teléfono.
      </p>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`font-mono text-[11px] uppercase tracking-wide ${
            message.kind === 'error' ? 'text-flame-500' : 'text-acid-400'
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="h-11 bg-acid-400 font-display text-sm uppercase tracking-wider text-ink-950 disabled:opacity-60"
      >
        {saving ? 'Guardando...' : 'Guardar ajustes'}
      </button>
    </form>
  );
}
