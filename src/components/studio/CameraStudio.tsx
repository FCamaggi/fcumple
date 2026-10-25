import { useCallback, useEffect, useState } from 'react';
import {
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
  getStickerPreviewUrl,
  listFrames,
  listStickers,
  reorderFrames,
  setStickerEnabled,
  updateFrame,
  uploadFrameImage,
  type EventFrame,
  type EventSticker,
} from '../../lib/cameraStudioApi';
import { useCanEditDesigns } from '../../hooks/useCanEditDesigns';
import { updateEvent, type OrganizerEvent } from '../../lib/organizerApi';
import PanelState from '../PanelState';
import FrameEditor from './FrameEditor';
import FramePreview from './FramePreview';
import StickerManager from './StickerManager';

interface CameraStudioProps {
  event: OrganizerEvent;
  onEventChange: (event: OrganizerEvent) => void;
}

type Editing = { kind: 'new'; template: FrameTemplate } | { kind: 'edit'; frame: EventFrame } | null;

const smallButton =
  'h-8 min-w-11 border border-smoke-700/60 px-3 font-mono text-xs uppercase tracking-wider text-paper-100 disabled:opacity-40';

/** URL firmada para mostrar la imagen de una capa; si no se puede firmar, esa imagen se omite. */
async function resolveFrameImage(path: string): Promise<string> {
  const url = await getStickerPreviewUrl(path);
  if (!url) throw new Error('No pudimos cargar la imagen.');
  return url;
}

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
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = useCanEditDesigns();
  // Al perder el computador se descarta lo que estaba abierto: al volver no reaparece solo.
  useEffect(() => {
    if (!canEdit) {
      setEditing(null);
    }
  }, [canEdit]);
  // Sube con «Reintentar» para volver a leer marcos y stickers.
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [event.id, reloadKey]);

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
      <PanelState
        kind="error"
        onRetry={() => {
          setError(null);
          setReloadKey((k) => k + 1);
        }}
      >
        {error}
      </PanelState>
    );
  }
  if (frames === null || stickers === null) {
    return <PanelState kind="loading">Cargando...</PanelState>;
  }

  // Si la ventana se achica con el editor abierto, se desmonta: solo se edita en computador.
  if (editing && canEdit) {
    const template = editing.kind === 'new' ? editing.template : editing.frame.template;
    return (
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
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
          eventSlug={event.slug}
          uploadImage={(file) => uploadFrameImage(event.id, file)}
          resolveImageUrl={resolveFrameImage}
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
    <div className="flex max-w-xl flex-col gap-8">
      {error && (
        <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}
      {!canEdit && (
        <p role="status" className="border border-smoke-700/60 bg-ink-900 p-3 font-mono text-xs uppercase tracking-wide text-paper-100/80">
          Para editar los diseños, entra desde un computador
        </p>
      )}

      {/* ---- Marcos ---- */}
      <section className="flex flex-col gap-3" aria-label="Marcos">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-hotpink-500">Marcos</h2>
          <label className="flex min-h-11 items-center gap-2 font-sans text-sm text-paper-100">
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

        {frames.length === 0 && (
          <p className="font-sans text-sm text-paper-100/60">
            {canEdit ? 'Todavía no hay marcos. Crea el primero.' : 'Todavía no hay marcos.'}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {frames.map((frame, index) => {
            const isDefault = event.defaultFrameId === frame.id;
            return (
              <li key={frame.id} className="flex flex-wrap items-center gap-3 bg-ink-900 p-2">
                <FramePreview
                  template={frame.template}
                  params={frame.params}
                  width={54}
                  height={72}
                  label={`Vista previa de ${frame.label}`}
                  resolveImageUrl={resolveFrameImage}
                />
                <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                  <span className="font-sans text-sm text-paper-100">{frame.label}</span>
                  <span className="font-mono text-xs uppercase tracking-wide text-paper-100/50">
                    {TEMPLATE_LABELS[frame.template]}
                    {isDefault ? ' · por defecto' : ''}
                  </span>
                  <label className="flex min-h-11 items-center gap-2 font-sans text-xs text-paper-100/80">
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
                  {canEdit && (
                    <>
                      <button type="button" className={smallButton} disabled={index === 0} onClick={() => void handleMove(frame, -1)} aria-label={`Subir ${frame.label}`}>
                        ↑
                      </button>
                      <button type="button" className={smallButton} disabled={index === frames.length - 1} onClick={() => void handleMove(frame, 1)} aria-label={`Bajar ${frame.label}`}>
                        ↓
                      </button>
                      <button type="button" className={smallButton} onClick={() => setEditing({ kind: 'edit', frame })} aria-label={`Editar ${frame.label}`}>
                        Editar
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={smallButton}
                    disabled={isDefault || !frame.enabled}
                    onClick={() => void patchEvent({ defaultFrameId: frame.id })}
                    aria-label={`Usar ${frame.label} por defecto`}
                  >
                    Por defecto
                  </button>
                  {canEdit && (
                    <>
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
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing({ kind: 'new', template: 'capas' })}
            className="h-10 w-fit bg-acid-400 px-4 font-display text-xs uppercase tracking-wider text-ink-950"
          >
            Nuevo marco
          </button>
        )}
      </section>

      {/* ---- Stickers ---- */}
      <section className="flex flex-col gap-3" aria-label="Stickers">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-hotpink-500">Stickers</h2>
          <label className="flex min-h-11 items-center gap-2 font-sans text-sm text-paper-100">
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
          readOnly={!canEdit}
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
