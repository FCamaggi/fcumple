import { useEffect, useState } from 'react';
import { getEventConfig, updateEventConfig } from '../lib/eventApi';
import type { EventConfig } from '../types';

type FormState = {
  eventName: string;
  eventDate: string;
  location: string;
  rsvpDeadline: string;
};

const EMPTY_FORM: FormState = {
  eventName: '',
  eventDate: '',
  location: '',
  rsvpDeadline: '',
};

// <input type="datetime-local"> wants "yyyy-MM-ddTHH:mm" in local time,
// not an ISO instant — convert both ways at the edges of the form.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toFormState(config: EventConfig | null): FormState {
  return {
    eventName: config?.eventName ?? '',
    eventDate: isoToLocalInput(config?.eventDate ?? null),
    location: config?.location ?? '',
    rsvpDeadline: isoToLocalInput(config?.rsvpDeadline ?? null),
  };
}

/**
 * EventSettingsForm — panel del admin para editar la fila única de
 * event_config. Estética consistente con el resto del admin (fondo
 * ink-950/ink-900, tipografía mono/uppercase de labels).
 */
interface EventSettingsFormProps {
  onSaved?: (config: EventConfig) => void;
}

export default function EventSettingsForm({ onSaved }: EventSettingsFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getEventConfig()
      .then((config) => {
        if (active) setForm(toFormState(config));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'No pudimos cargar la configuración del evento.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateEventConfig({
        eventName: form.eventName || null,
        eventDate: localInputToIso(form.eventDate),
        location: form.location || null,
        rsvpDeadline: localInputToIso(form.rsvpDeadline),
      });
      setSaved(true);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar la configuración del evento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 border border-smoke-700/50 bg-ink-900 p-6 shadow-2xl"
    >
      <span className="font-mono text-[11px] uppercase tracking-widest text-acid-400">Configuración del evento</span>

      {loading ? (
        <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">Cargando...</span>
      ) : (
        <>
          <Field label="Nombre del evento" htmlFor="event-name">
            <input
              id="event-name"
              type="text"
              value={form.eventName}
              onChange={(e) => updateField('eventName', e.target.value)}
              className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
            />
          </Field>

          <Field label="Fecha del evento" htmlFor="event-date">
            <input
              id="event-date"
              type="datetime-local"
              value={form.eventDate}
              onChange={(e) => updateField('eventDate', e.target.value)}
              className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
            />
          </Field>

          <Field label="Ubicación" htmlFor="event-location">
            <input
              id="event-location"
              type="text"
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
              className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
            />
          </Field>

          <Field label="Corte de RSVP" htmlFor="event-rsvp-deadline">
            <input
              id="event-rsvp-deadline"
              type="datetime-local"
              value={form.rsvpDeadline}
              onChange={(e) => updateField('rsvpDeadline', e.target.value)}
              className="bg-ink-950 px-3 py-2 font-sans text-sm text-paper-100 outline-none"
            />
          </Field>

          {error && (
            <p className="font-mono text-[11px] uppercase tracking-wider text-flame-500">{error}</p>
          )}
          {saved && !error && (
            <p className="font-mono text-[11px] uppercase tracking-wider text-acid-400">Guardado</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="self-start bg-acid-400 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      )}
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
        {label}
      </label>
      {children}
    </div>
  );
}
