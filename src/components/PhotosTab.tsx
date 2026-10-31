import { useState } from 'react';
import PanelState from './PanelState';
import PhotoModerationPanel from './PhotoModerationPanel';
import type { EventPhotos } from '../hooks/useEventPhotos';
import ExportPhotos from './ExportPhotos';

interface PhotosTabProps {
  /** Para nombrar el archivo descargado. */
  eventSlug?: string;
  /** Las fotos del evento: las pide la página del panel y las comparte con «Hoy» y con la insignia de «Fotos». */
  photos: EventPhotos;
}

/**
 * PhotosTab — las fotos del evento: revisarlas (aprobar o rechazar) y PUBLICARLAS por lotes. Los invitados no
 * ven ninguna foto hasta que la organizadora las publica; cada vez que pulsa «Publicar» se suman a la cartelera
 * todas las aprobadas que faltaban. Reutiliza `PhotoModerationPanel` con las funciones de la Fase 1 (que
 * trabajan sobre ESTE evento).
 */
export default function PhotosTab({ photos: state, eventSlug = 'evento' }: PhotosTabProps) {
  const [moderating, setModerating] = useState(false);
  const { photos, counts, error, publishError, notice, publishing, reload, handlePublish, source } = state;

  // Al abrir y al cerrar la revisión se vuelve a pedir la lista: lo revisado cambia los conteos.
  function setReviewOpen(open: boolean) {
    setModerating(open);
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <PanelState kind="error" onRetry={reload}>
          {error}
        </PanelState>
      )}
      {/* El de publicar no lleva «Reintentar»: volver a leer la lista no lo arregla. */}
      {publishError && <PanelState kind="error">{publishError}</PanelState>}
      {photos === null && !error && <PanelState kind="loading">Cargando fotos...</PanelState>}
      {photos !== null && photos.length === 0 && !error && (
        <PanelState kind="empty">Todavía no llegan fotos. Aparecerán aquí cuando los invitados las tomen.</PanelState>
      )}
      {notice && (
        <p role="status" className="font-mono text-xs uppercase tracking-wide text-acid-400">
          {notice}
        </p>
      )}

      {photos && photos.length > 0 && (
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
          onClick={() => setReviewOpen(true)}
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

      {photos && photos.length > 0 && <ExportPhotos photos={photos} eventSlug={eventSlug} />}

      {moderating && <PhotoModerationPanel onClose={() => setReviewOpen(false)} source={source} />}
    </div>
  );
}
