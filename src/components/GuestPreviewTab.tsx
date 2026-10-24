import { useState } from 'react';
import PhoneFrame from './PhoneFrame';
import { PREVIEW_STATES, type CatalogState } from '../lib/guestPreview';
import type { OrganizerEvent } from '../lib/organizerApi';

/**
 * GuestPreviewTab — «Ver como invitado» (épica C1): la pantalla del invitado en un teléfono, con los estados que
 * puede tener. No crea invitados ni fotos y no lleva el código del QR: la dirección del iframe solo lleva el
 * evento y el estado inicial, y los cambios siguientes viajan por mensaje.
 */
export default function GuestPreviewTab({ event }: { event: OrganizerEvent }) {
  const [state, setState] = useState<CatalogState>('activa');
  const [note, setNote] = useState<string | null>(null);
  // La dirección no cambia con el estado: si cambiara, el iframe se recargaría en cada clic.
  const [src] = useState(() => `/panel/e/${event.id}/vista-previa?estado=${state}`);
  const current = PREVIEW_STATES.find((s) => s.id === state) ?? PREVIEW_STATES[2];

  return (
    <section className="flex flex-col gap-4 border border-smoke-700/50 bg-ink-900 p-4 shadow-2xl">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-acid-400">Vista previa // lo que ve el invitado</span>
        <p className="font-sans text-sm text-paper-100/70">
          Así se ve tu evento en un teléfono, con tu estilo y tus avisos publicados. Solo se mira: los botones no hacen
          nada, no se crea ningún invitado y las personas y fotos son de ejemplo.
        </p>
      </div>

      <div role="group" aria-label="Estado que quieres ver" className="flex flex-wrap gap-2">
        {PREVIEW_STATES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={state === s.id}
            onClick={() => {
              setState(s.id);
              setNote(null);
            }}
            className={`h-11 px-3 font-mono text-xs uppercase tracking-wider ${
              state === s.id ? 'border border-acid-400 text-acid-400' : 'border border-smoke-700/60 text-paper-100'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {note && (
        <p role="status" className="border border-smoke-700/60 px-3 py-2 font-mono text-xs uppercase tracking-wider text-laser-500">
          {note}
        </p>
      )}

      <PhoneFrame src={src} label={current.label} state={state} onNote={setNote} />
    </section>
  );
}
