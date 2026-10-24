import { useState } from 'react';
import PhotoModerationPanel from './PhotoModerationPanel';
import { useEventPhotos } from '../hooks/useEventPhotos';
import type { OrganizerEvent } from '../lib/organizerApi';

interface PhotosTabProps {
  event: OrganizerEvent;
  onEventChange: (event: OrganizerEvent) => void;
}

/**
 * PhotosTab — las fotos del evento: revisarlas (aprobar o rechazar) y PUBLICARLAS por lotes. Los invitados no
 * ven ninguna foto hasta que la organizadora las publica; cada vez que pulsa «Publicar» se suman a la cartelera
 * todas las aprobadas que faltaban. Reutiliza `PhotoModerationPanel` con las funciones de la Fase 1 (que
 * trabajan sobre ESTE evento).
 */
export default function PhotosTab({ event, onEventChange }: PhotosTabProps) {
  const [moderating, setModerating] = useState(false);
  // Al abrir y al cerrar la revisión se vuelve a pedir la lista: lo revisado cambia los conteos.
  const { photos, counts, error, notice, publishing, handlePublish, source } = useEventPhotos(
    event,
    onEventChange,
    moderating ? 1 : 0,
  );

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="font-mono text-xs uppercase tracking-wide text-acid-400">
          {notice}
        </p>
      )}

      {photos && (
        <p className="font-mono text-xs uppercase tracking-widest text-laser-500">
          {photos.length} fotos · {counts.pending} por revisar · {counts.approved} aprobadas · {counts.rejected} rechazadas
        </p>
      )}

      <p className="font-sans text-sm text-paper-100/80">
        Los invitados no ven ninguna foto hasta que tú las publicas. Revisa las que llegan (apruébalas o recházalas) y
        publícalas por lotes: cada vez que publicas, se suman a la cartelera todas las aprobadas que faltaban.
        {photos && counts.unpublished > 0 && ` Tienes ${counts.unpublished} aprobada(s) sin publicar.`}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModerating(true)}
          className="h-11 bg-acid-400 px-5 font-display text-sm uppercase tracking-wider text-ink-950"
        >
          {counts.pending > 0 ? `Revisar ${counts.pending} foto(s)` : 'Abrir revisión de fotos'}
        </button>
        <button
          type="button"
          onClick={() => void handlePublish()}
          disabled={publishing || counts.unpublished === 0}
          className="h-11 border border-acid-400 px-5 font-display text-sm uppercase tracking-wider text-acid-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {publishing ? 'Publicando...' : `Publicar ${counts.unpublished} aprobada(s)`}
        </button>
      </div>

      {moderating && <PhotoModerationPanel onClose={() => setModerating(false)} source={source} />}
    </div>
  );
}
