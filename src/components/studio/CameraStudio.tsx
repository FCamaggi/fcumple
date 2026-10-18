import { useCallback, useEffect, useState } from 'react';
import {
  FRAME_TEMPLATES,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_LABELS,
  defaultFrameParams,
  type FrameParams,
  type FrameTemplate,
} from '../../lib/cameraAssets/frames';
import {
  addEmojiSticker,
  addImageSticker,
  createFrame,
  deleteFrame,
  deleteSticker,
  listFrames,
  listStickers,
  reorderFrames,
  setStickerEnabled,
  updateFrame,
  type EventFrame,
  type EventSticker,
} from '../../lib/cameraStudioApi';
import { updateEvent, type OrganizerEvent } from '../../lib/organizerApi';
import FrameEditor from './FrameEditor';
import FramePreview from './FramePreview';
import StickerManager from './StickerManager';

interface CameraStudioProps {
  event: OrganizerEvent;
  onEventChange: (event: OrganizerEvent) => void;
}

type Editing = { kind: 'new'; template: FrameTemplate } | { kind: 'edit'; frame: EventFrame } | null;

const smallButton =
  'h-8 border border-smoke-700/60 px-3 font-mono text-[11px] uppercase tracking-wider text-paper-100 disabled:opacity-40';

function formatDate(iso: string | null): string | undefined {
  return iso ? new Intl.DateTimeFormat('es-CL').format(new Date(iso)) : undefined;
}

/**
 * CameraStudio — el organizador diseña la experiencia de cámara de su evento:
 * qué marcos (con sus colores y textos) y qué stickers (emojis e imágenes)
 * tienen los invitados, y los activa o apaga con interruptores. Los invitados
 * solo eligen entre lo que queda activo.
 */
export default function CameraStudio({ event, onEventChange }: CameraStudioProps) {
  const [frames, setFrames] = useState<EventFrame[] | null>(null);
  const [stickers, setStickers] = useState<EventSticker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listFrames(event.id), listStickers(event.id)])
      .then(([f, s]) => {
        if (!active) return;
        setFrames(f);
        setStickers(s);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'No pudimos cargar la cámara.');
      });
    return () => {
      active = false;
    };
  }, [event.id]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos hacer el cambio.');
    }
  }, []);

  async function patchEvent(patch: Parameters<typeof updateEvent>[1]) {
    await run(async () => onEventChange(await updateEvent(event.id, patch)));
  }

  const replaceFrame = (next: EventFrame) =>
    setFrames((current) => (current ?? []).map((f) => (f.id === next.id ? next : f)));

  async function handleMove(frame: EventFrame, direction: -1 | 1) {
    const list = frames ?? [];
    const index = list.findIndex((f) => f.id === frame.id);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await run(async () => {
      await reorderFrames(reordered.map((f) => f.id));
      setFrames(reordered.map((f, position) => ({ ...f, sortOrder: position })));
    });
  }

  async function handleSave(label: string, params: FrameParams) {
    if (!editing) return;
    setSaving(true);
    await run(async () => {
      if (editing.kind === 'new') {
        const created = await createFrame(event.id, { template: editing.template, label, params }, (frames ?? []).length);
        setFrames((current) => [...(current ?? []), created]);
      } else {
        replaceFrame(await updateFrame(editing.frame.id, { label, params }));
      }
      setEditing(null);
    });
    setSaving(false);
  }

  if (error && frames === null) {
    return (
      <p role="alert" className="font-mono text-xs uppercase tracking-wider text-flame-500">
        {error}
      </p>
    );
  }
  if (frames === null || stickers === null) {
    return <p className="font-mono text-xs uppercase tracking-widest text-acid-400">Cargando...</p>;
  }

  if (editing) {
    const template = editing.kind === 'new' ? editing.template : editing.frame.template;
    return (
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
            {error}
          </p>
        )}
        <FrameEditor
          template={template}
          initialLabel={editing.kind === 'new' ? TEMPLATE_LABELS[template] : editing.frame.label}
          initialParams={
            editing.kind === 'new'
              ? defaultFrameParams(template, { eventName: event.name, eventDate: formatDate(event.startsAt) })
              : editing.frame.params
          }
          saving={saving}
          onSave={(label, params) => void handleSave(label, params)}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}

      {/* ---- Marcos ---- */}
      <section className="flex flex-col gap-3" aria-label="Marcos">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-hotpink-500">Marcos</h2>
          <label className="flex items-center gap-2 font-sans text-sm text-paper-100">
            <input
              type="checkbox"
              role="switch"
              checked={event.framesEnabled}
              onChange={(e) => void patchEvent({ framesEnabled: e.target.checked })}
              aria-label="Mostrar marcos a los invitados"
            />
            Mostrar marcos a los invitados
          </label>
        </div>

        {frames.length === 0 && <p className="font-sans text-sm text-paper-100/60">Todavía no hay marcos. Crea el primero.</p>}

        <ul className="flex flex-col gap-2">
          {frames.map((frame, index) => {
            const isDefault = event.defaultFrameId === frame.id;
            return (
              <li key={frame.id} className="flex flex-wrap items-center gap-3 bg-ink-900 p-2">
                <FramePreview template={frame.template} params={frame.params} width={54} height={72} label={`Vista previa de ${frame.label}`} />
                <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                  <span className="font-sans text-sm text-paper-100">{frame.label}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-paper-100/50">
                    {TEMPLATE_LABELS[frame.template]}
                    {isDefault ? ' · por defecto' : ''}
                  </span>
                  <label className="flex items-center gap-2 font-sans text-xs text-paper-100/80">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={frame.enabled}
                      aria-label={`Activo: ${frame.label}`}
                      onChange={(e) => void run(async () => replaceFrame(await updateFrame(frame.id, { enabled: e.target.checked })))}
                    />
                    {frame.enabled ? 'Activo' : 'Apagado'}
                  </label>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className={smallButton} disabled={index === 0} onClick={() => void handleMove(frame, -1)} aria-label={`Subir ${frame.label}`}>
                    ↑
                  </button>
                  <button type="button" className={smallButton} disabled={index === frames.length - 1} onClick={() => void handleMove(frame, 1)} aria-label={`Bajar ${frame.label}`}>
                    ↓
                  </button>
                  <button type="button" className={smallButton} onClick={() => setEditing({ kind: 'edit', frame })} aria-label={`Editar ${frame.label}`}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    disabled={isDefault || !frame.enabled}
                    onClick={() => void patchEvent({ defaultFrameId: frame.id })}
                    aria-label={`Usar ${frame.label} por defecto`}
                  >
                    Por defecto
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    aria-label={`Duplicar ${frame.label}`}
                    onClick={() =>
                      void run(async () => {
                        const copy = await createFrame(
                          event.id,
                          { template: frame.template, label: `${frame.label} (copia)`.slice(0, 60), params: frame.params },
                          frames.length,
                        );
                        setFrames((current) => [...(current ?? []), copy]);
                      })
                    }
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    aria-label={`Borrar ${frame.label}`}
                    onClick={() => {
                      if (!window.confirm(`¿Borrar el marco "${frame.label}"?`)) return;
                      void run(async () => {
                        await deleteFrame(frame.id);
                        setFrames((current) => (current ?? []).filter((f) => f.id !== frame.id));
                        if (isDefault) onEventChange({ ...event, defaultFrameId: null });
                      });
                    }}
                  >
                    Borrar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {picking ? (
          <div className="flex flex-col gap-2" role="group" aria-label="Elige una plantilla">
            <p className="font-sans text-sm text-paper-100/80">Elige una plantilla:</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {/* `capas` queda fuera hasta tener migración y editor visual (pasos 2 y 3 del plan de marcos por capas). */}
              {FRAME_TEMPLATES.filter((template) => template !== 'capas').map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => {
                    setPicking(false);
                    setEditing({ kind: 'new', template });
                  }}
                  className="flex flex-col items-center gap-1 bg-ink-900 p-2"
                  aria-label={`Plantilla ${TEMPLATE_LABELS[template]}`}
                >
                  <FramePreview template={template} params={defaultFrameParams(template, { eventName: event.name })} width={72} height={96} />
                  <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100">{TEMPLATE_LABELS[template]}</span>
                  <span className="text-center font-sans text-[10px] text-paper-100/60">{TEMPLATE_DESCRIPTIONS[template]}</span>
                </button>
              ))}
            </div>
            <button type="button" className={`${smallButton} w-fit`} onClick={() => setPicking(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="h-10 w-fit bg-acid-400 px-4 font-display text-xs uppercase tracking-wider text-ink-950"
          >
            Nuevo marco
          </button>
        )}
      </section>

      {/* ---- Stickers ---- */}
      <section className="flex flex-col gap-3" aria-label="Stickers">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-hotpink-500">Stickers</h2>
          <label className="flex items-center gap-2 font-sans text-sm text-paper-100">
            <input
              type="checkbox"
              role="switch"
              checked={event.stickersEnabled}
              onChange={(e) => void patchEvent({ stickersEnabled: e.target.checked })}
              aria-label="Permitir stickers a los invitados"
            />
            Permitir stickers a los invitados
          </label>
        </div>
        <StickerManager
          stickers={stickers}
          onAddEmoji={async (emoji) => {
            const created = await addEmojiSticker(event.id, emoji, stickers.length);
            setStickers((current) => [...(current ?? []), created]);
          }}
          onAddImage={async (file) => {
            const created = await addImageSticker(event.id, file, stickers.length);
            setStickers((current) => [...(current ?? []), created]);
          }}
          onToggle={async (sticker, enabled) => {
            const next = await setStickerEnabled(sticker.id, enabled);
            setStickers((current) => (current ?? []).map((s) => (s.id === next.id ? next : s)));
          }}
          onDelete={async (sticker) => {
            await deleteSticker(sticker);
            setStickers((current) => (current ?? []).filter((s) => s.id !== sticker.id));
          }}
        />
      </section>
    </div>
  );
}
