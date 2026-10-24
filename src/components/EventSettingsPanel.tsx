import { useState } from 'react';
import type { AccessMode } from '../lib/platformApi';
import type { CameraUnlock, EventSettingsPatch, OrganizerEvent } from '../lib/organizerApi';
import { isoToLocalInput, localInputToIso } from '../lib/localDateTime';
import PhoneFrame from './PhoneFrame';
import { THEME_PRESETS, resolveTheme } from '../lib/theme';

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
  on_event_qr: 'Cuando escanee el QR de la fiesta (recomendado)',
  on_identify: 'Apenas se inscribe',
  on_checkin: 'Cuando marques su llegada en la puerta',
};

const fieldClass =
  'bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none focus-visible:ring-2 focus-visible:ring-acid-400';
const selectClass = fieldClass;
const labelClass = 'font-mono text-xs uppercase tracking-wider text-paper-100/70';

/** Ajustes del evento: nombre, fecha y lugar, cómo entran los invitados, cupo de fotos y cuándo se habilita la cámara. */
export default function EventSettingsPanel({ event, onSave }: EventSettingsPanelProps) {
  const [name, setName] = useState(event.name);
  const [subtitle, setSubtitle] = useState(event.subtitle ?? '');
  const [themeId, setThemeId] = useState(resolveTheme(event.theme).id);
  const [startsAt, setStartsAt] = useState(isoToLocalInput(event.startsAt));
  const [location, setLocation] = useState(event.location ?? '');
  const [photoQuota, setPhotoQuota] = useState(String(event.defaultPhotoQuota));
  const [accessMode, setAccessMode] = useState<AccessMode>(event.accessMode);
  const [cameraUnlock, setCameraUnlock] = useState<CameraUnlock>(event.cameraUnlock);
  const [showPreview, setShowPreview] = useState(false);
  // La dirección no lleva el estilo ni cambia al elegir otro: si cambiara, el iframe se recargaría con cada opción.
  const [previewSrc] = useState(() => `/panel/e/${event.id}/vista-previa?estado=activa`);
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
        ...(subtitle.trim() !== (event.subtitle ?? '') ? { subtitle: subtitle.trim() || null } : {}),
        ...(themeId !== resolveTheme(event.theme).id ? { theme: { preset: themeId } } : {}),
        // Solo si la tocó: reenviarla en cada guardado reescribiría la fecha (y le quitaría los segundos).
        ...(startsAt !== isoToLocalInput(event.startsAt) ? { startsAt: localInputToIso(startsAt) } : {}),
        location: location.trim() || null,
        defaultPhotoQuota: quota,
        accessMode,
        cameraUnlock,
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
        <p className="font-sans text-xs text-paper-100/60">Es el título grande que ven tus invitados.</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ev-subtitle" className={labelClass}>
          Subtítulo <span className="text-paper-100/50">opcional</span>
        </label>
        <input
          id="ev-subtitle"
          value={subtitle}
          maxLength={80}
          onChange={(e) => setSubtitle(e.target.value)}
          className={fieldClass}
        />
        <p className="font-sans text-xs text-paper-100/60">Una línea debajo del título. Por ejemplo: «Cumpleaños Fran».</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ev-theme" className={labelClass}>
          Estilo del evento
        </label>
        <select id="ev-theme" value={themeId} onChange={(e) => setThemeId(e.target.value)} className={selectClass}>
          {THEME_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <p className="font-sans text-xs text-paper-100/60">
          Los colores de la página de tus invitados y de este panel. Se aplica al guardar.
        </p>
        <button
          type="button"
          aria-expanded={showPreview}
          onClick={() => setShowPreview((open) => !open)}
          className="h-11 border border-smoke-700/60 px-3 font-mono text-xs uppercase tracking-wider text-paper-100"
        >
          {showPreview ? 'Ocultar vista previa' : 'Ver cómo queda'}
        </button>
        {showPreview && (
          <PhoneFrame src={previewSrc} label="Estilo del evento" state="activa" themeId={themeId} />
        )}
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

      <p className="font-sans text-xs text-paper-100/60">
        Cada invitado se inscribe con su nombre y apellido y un PIN que elige él mismo. No se pide RUT, correo ni teléfono.
      </p>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`font-mono text-xs uppercase tracking-wide ${
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
