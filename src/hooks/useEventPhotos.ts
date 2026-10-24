import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listEventPhotos, moderateEventPhoto, publishPhotoBatch, type OrganizerEvent } from '../lib/organizerApi';
import { countModerationPhotos } from '../lib/partyDay';
import type { ModerationPhoto } from '../lib/photosApi';

/**
 * Las fotos de un evento tal como las ve la organizadora: lista, conteo por estado, publicación del lote (con su
 * confirmación) y la fuente que usa `PhotoModerationPanel`. Lo comparten la pestaña «Fotos» y la pestaña «Hoy».
 * `refreshToken` vuelve a pedir la lista cuando cambia (por ejemplo, al cerrar la revisión).
 */
export function useEventPhotos(event: OrganizerEvent, onEventChange: (event: OrganizerEvent) => void, refreshToken = 0) {
  const [photos, setPhotos] = useState<ModerationPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Con otro evento no deben verse un instante las fotos del anterior.
  const loadedFor = useRef(event.id);

  useEffect(() => {
    let active = true;
    setError(null);
    if (loadedFor.current !== event.id) {
      loadedFor.current = event.id;
      setPhotos(null);
    }
    listEventPhotos(event.id)
      .then((found) => active && setPhotos(found))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : 'No pudimos cargar las fotos.'));
    return () => {
      active = false;
    };
  }, [event.id, refreshToken, reloadKey]);

  /** Vuelve a pedir la lista: limpia el error anterior (sirve de «Reintentar»). */
  const reload = useCallback(() => {
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const counts = useMemo(() => countModerationPhotos(photos ?? []), [photos]);

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

  // Se fija una vez por montaje del panel de revisión: ver PhotoModerationPanel.
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

  return { photos, counts, error, notice, publishing, reload, handlePublish, source };
}
