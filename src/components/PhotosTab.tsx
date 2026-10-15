import { useEffect, useMemo, useState } from 'react';
import PhotoModerationPanel from './PhotoModerationPanel';
import { listEventPhotos, moderateEventPhoto, revealEventPhotos, type OrganizerEvent } from '../lib/organizerApi';
import type { ModerationPhoto } from '../lib/photosApi';

interface PhotosTabProps {
  event: OrganizerEvent;
  onEventChange: (event: OrganizerEvent) => void;
}

/**
 * PhotosTab — resumen de las fotos del evento y acceso a la moderación y al
 * revelado del rollo. Reutiliza `PhotoModerationPanel` con las funciones de
 * la Fase 1 (que trabajan sobre ESTE evento).
 */
export default function PhotosTab({ event, onEventChange }: PhotosTabProps) {
  const [photos, setPhotos] = useState<ModerationPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);

  useEffect(() => {
    let active = true;
    listEventPhotos(event.id)
      .then((found) => active && setPhotos(found))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : 'No pudimos cargar las fotos.'));
    return () => {
      active = false;
    };
  }, [event.id, moderating]);

  const counts = useMemo(() => {
    const result = { pending: 0, approved: 0, rejected: 0 };
    for (const photo of photos ?? []) result[photo.status] += 1;
    return result;
  }, [photos]);

  // Se fija una vez por montaje del panel: ver PhotoModerationPanel.
  const source = useMemo(
    () => ({
      list: () => listEventPhotos(event.id),
      moderate: (id: string, status: 'approved' | 'rejected') => moderateEventPhoto(id, status),
      reveal: async () => onEventChange(await revealEventPhotos(event.id)),
    }),
    [event.id, onEventChange],
  );

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}

      {photos && (
        <p className="font-mono text-[11px] uppercase tracking-widest text-laser-500">
          {photos.length} fotos · {counts.pending} por revisar · {counts.approved} aprobadas · {counts.rejected} rechazadas
        </p>
      )}

      <p className="font-sans text-sm text-paper-100/80">
        {event.photosRevealedAt
          ? 'El rollo ya está revelado: los invitados ven las fotos aprobadas.'
          : 'El rollo sigue oculto. Cuando lo reveles, los invitados verán las fotos aprobadas.'}
      </p>

      <button
        type="button"
        onClick={() => setModerating(true)}
        className="h-11 w-fit bg-acid-400 px-5 font-display text-sm uppercase tracking-wider text-ink-950"
      >
        {counts.pending > 0 ? `Revisar ${counts.pending} foto(s)` : 'Abrir moderación y revelado'}
      </button>

      {moderating && (
        <PhotoModerationPanel
          onClose={() => setModerating(false)}
          source={source}
          initiallyRevealed={event.photosRevealedAt !== null}
        />
      )}
    </div>
  );
}
