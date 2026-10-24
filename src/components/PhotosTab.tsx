import { useEffect, useMemo, useState } from 'react';
import PhotoModerationPanel from './PhotoModerationPanel';
import { listEventPhotos, moderateEventPhoto, publishPhotoBatch, type OrganizerEvent } from '../lib/organizerApi';
import type { ModerationPhoto } from '../lib/photosApi';

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
  const [photos, setPhotos] = useState<ModerationPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    listEventPhotos(event.id)
      .then((found) => active && setPhotos(found))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : 'No pudimos cargar las fotos.'));
    return () => {
      active = false;
    };
  }, [event.id, moderating, reloadKey]);

  const counts = useMemo(() => {
    const result = { pending: 0, approved: 0, rejected: 0, unpublished: 0 };
    for (const photo of photos ?? []) {
      result[photo.status] += 1;
      if (photo.status === 'approved' && !photo.publishedAt) result.unpublished += 1;
    }
    return result;
  }, [photos]);

  /** Publica el lote y deja el evento marcado como «con fotos» (lo que lee el hub). */
  async function publish(): Promise<number> {
    const count = await publishPhotoBatch(event.id);
    onEventChange({ ...event, photosRevealedAt: event.photosRevealedAt ?? new Date().toISOString() });
    setReloadKey((k) => k + 1);
    return count;
  }

  async function handlePublish() {
    setError(null);
    setNotice(null);
    let message = `¿Publicar ${counts.unpublished} foto(s) aprobada(s)? Tus invitados las verán en la cartelera.`;
    if (counts.pending > 0) {
      message += `\n\nQuedan ${counts.pending} foto(s) sin revisar: no se publican hasta que las apruebes.`;
    }
    if (!window.confirm(message)) return;
    setPublishing(true);
    try {
      const count = await publish();
      setNotice(count > 0 ? `Publicaste ${count} foto(s).` : 'No había fotos aprobadas nuevas para publicar.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos publicar las fotos.');
    } finally {
      setPublishing(false);
    }
  }

  // Se fija una vez por montaje del panel: ver PhotoModerationPanel.
  const source = useMemo(
    () => ({
      list: () => listEventPhotos(event.id),
      moderate: (id: string, status: 'approved' | 'rejected') => moderateEventPhoto(id, status),
      publish: async () => {
        const count = await publishPhotoBatch(event.id);
        onEventChange({ ...event, photosRevealedAt: event.photosRevealedAt ?? new Date().toISOString() });
        return count;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event.id, onEventChange],
  );

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="font-mono text-[11px] uppercase tracking-wide text-flame-500">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="font-mono text-[11px] uppercase tracking-wide text-acid-400">
          {notice}
        </p>
      )}

      {photos && (
        <p className="font-mono text-[11px] uppercase tracking-widest text-laser-500">
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
