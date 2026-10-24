import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listEventPhotos, moderateEventPhoto, publishPhotoBatch, type OrganizerEvent } from '../lib/organizerApi';
import { countModerationPhotos } from '../lib/partyDay';
import type { ModerationPhoto } from '../lib/photosApi';

const NOT_LOADED = 'El evento todavía no carga.';

/**
 * Las fotos de un evento tal como las ve la organizadora: lista, conteo por estado, publicación del lote (con su
 * confirmación) y la fuente que usa `PhotoModerationPanel`. Vive en la página del panel y lo comparten las pestañas
 * «Fotos» y «Hoy» y la insignia de «fotos por revisar»; `event` es `null` mientras el evento carga.
 * `refreshToken` vuelve a pedir la lista cuando cambia (por ejemplo, al cerrar la revisión).
 */
export function useEventPhotos(
  event: OrganizerEvent | null,
  onEventChange: (event: OrganizerEvent) => void,
  refreshToken = 0,
) {
  // La página lo llama antes de tener el evento: sin él no pide nada.
  const eventId = event?.id ?? null;
  const [photos, setPhotos] = useState<ModerationPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Con otro evento no deben verse un instante las fotos del anterior.
  const loadedFor = useRef(eventId);
  // El hook dura lo que la página, no lo que una pestaña: lo que se hace tras un `await` debe partir del evento de
  // ahora (que pudo cambiar al guardar Ajustes), no del que había al montar.
  const latest = useRef(event);
  latest.current = event;
  // Si la última lectura falló, las fotos que quedan son de antes: no deben mostrarse al volver a pedirlas.
  const lastLoadFailed = useRef(false);

  /** Deja el evento marcado como «con fotos» (lo que lee el hub), sobre su última versión. */
  const markRevealed = useCallback(() => {
    const current = latest.current;
    if (current) onEventChange({ ...current, photosRevealedAt: current.photosRevealedAt ?? new Date().toISOString() });
  }, [onEventChange]);

  useEffect(() => {
    if (eventId === null) return;
    let active = true;
    setError(null);
    if (loadedFor.current !== eventId) {
      loadedFor.current = eventId;
      setPhotos(null);
    }
    listEventPhotos(eventId)
      .then((found) => {
        if (!active) return;
        lastLoadFailed.current = false;
        setPhotos(found);
      })
      .catch((err: unknown) => {
        if (!active) return;
        lastLoadFailed.current = true;
        setError(err instanceof Error ? err.message : 'No pudimos cargar las fotos.');
      });
    return () => {
      active = false;
    };
  }, [eventId, refreshToken, reloadKey]);

  /**
   * Vuelve a pedir la lista: limpia el error y el aviso anteriores (sirve de «Reintentar»). Si la lectura anterior
   * falló, suelta también las fotos viejas, para que ni la insignia ni las pestañas muestren una cuenta dudosa.
   */
  const reload = useCallback(() => {
    setError(null);
    setNotice(null);
    if (lastLoadFailed.current) setPhotos(null);
    setReloadKey((k) => k + 1);
  }, []);

  const counts = useMemo(() => countModerationPhotos(photos ?? []), [photos]);

  /** Publica el lote y deja el evento marcado como «con fotos» (lo que lee el hub). */
  async function publish(): Promise<number> {
    if (!event) throw new Error(NOT_LOADED);
    const count = await publishPhotoBatch(event.id);
    markRevealed();
    setReloadKey((k) => k + 1);
    return count;
  }

  async function handlePublish() {
    if (!event) return;
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
      list: () => (event ? listEventPhotos(event.id) : Promise.reject(new Error(NOT_LOADED))),
      moderate: (id: string, status: 'approved' | 'rejected') => moderateEventPhoto(id, status),
      publish: async () => {
        if (!event) throw new Error(NOT_LOADED);
        const count = await publishPhotoBatch(event.id);
        markRevealed();
        return count;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventId, onEventChange],
  );

  return { photos, counts, error, notice, publishing, reload, handlePublish, source };
}

export type EventPhotos = ReturnType<typeof useEventPhotos>;
