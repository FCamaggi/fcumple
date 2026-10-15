import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import AnnouncementFeed from './AnnouncementFeed';
import CameraCapture from './CameraCapture';
import CameraSection from './CameraSection';
import RevealedRoll, { type RawRevealedPhoto } from './RevealedRoll';
import { getPhotoQuota } from '../lib/photosApi';
import { useCameraAssets } from '../hooks/useCameraAssets';
import {
  getPublicHeadcount,
  listPublishedPosts,
  listRevealedPhotosForGuest,
  uploadGuestPhoto,
} from '../lib/platformGuestApi';
import { getMyGuest, type EventPublic, type MyGuest } from '../lib/platformApi';
import type { PhotoQuota, Post } from '../types';

interface GuestHubProps {
  slug: string;
  token: string;
  event: EventPublic;
  guest: MyGuest;
  /** Se llama cuando el servidor informa un cambio en el invitado (p. ej. llegada marcada). */
  onGuestChange: (guest: MyGuest) => void;
}

/**
 * GuestHub — lo que ve el invitado ya identificado en `/e/:slug`: avisos del
 * evento, cámara (según `camera_unlock`) y rollo revelado. Reutiliza los
 * componentes de la Fase 0 con datos de las RPC de la Fase 1.
 */
export default function GuestHub({ slug, token, event, guest, onGuestChange }: GuestHubProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [headcount, setHeadcount] = useState<number | null>(null);
  const [quota, setQuota] = useState<PhotoQuota | null>(null);
  const [revealed, setRevealed] = useState<RawRevealedPhoto[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const cameraUnlocked = event.cameraUnlock === 'on_identify' || guest.checkedInAt !== null;
  // Marcos y stickers del evento: se cargan antes de ofrecer la cámara para que abra con todo listo.
  const cameraAssets = useCameraAssets(token, cameraUnlocked);
  const cameraReady = cameraAssets.status === 'ready' || cameraAssets.status === 'error';

  useEffect(() => {
    let active = true;
    listPublishedPosts(slug)
      .then((found) => active && setPosts(found))
      .catch(() => active && setPosts([]));
    getPublicHeadcount(slug)
      .then((n) => active && setHeadcount(n))
      .catch(() => active && setHeadcount(null));
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!cameraUnlocked) {
      setQuota(null);
      return;
    }
    let active = true;
    getPhotoQuota(token)
      .then((q) => active && setQuota(q))
      .catch(() => active && setQuota(null));
    return () => {
      active = false;
    };
  }, [token, cameraUnlocked]);

  useEffect(() => {
    if (!event.photosRevealed) {
      setRevealed([]);
      return;
    }
    let active = true;
    listRevealedPhotosForGuest(token)
      .then((photos) => active && setRevealed(photos))
      .catch(() => active && setRevealed([]));
    return () => {
      active = false;
    };
  }, [token, event.photosRevealed]);

  const upload = useMemo(
    () => (blob: Blob, displayBlob?: Blob | null) =>
      uploadGuestPhoto({ token, eventId: guest.eventId, guestId: guest.id }, blob, displayBlob),
    [token, guest.eventId, guest.id],
  );

  const refreshGuest = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await getMyGuest(token);
      if (fresh) onGuestChange(fresh);
    } catch {
      // Sin conexión: el invitado puede volver a intentarlo.
    } finally {
      setRefreshing(false);
    }
  }, [token, onGuestChange]);

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      {headcount !== null && headcount > 0 && (
        <p className="text-center font-mono text-[11px] uppercase tracking-widest text-hotpink-500">
          Aforo // {headcount} confirmados
        </p>
      )}

      {cameraUnlocked && quota && cameraReady && <CameraSection quota={quota} onOpen={() => setShowCamera(true)} />}

      {!cameraUnlocked && (
        <section className="flex flex-col gap-3 bg-ink-900 p-4 shadow-2xl" aria-label="Cámara bloqueada">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-hotpink-500">
            Cámara // aún bloqueada
          </span>
          <p className="font-sans text-sm text-paper-100/80">
            Muestra tu código en la puerta. Cuando marquen tu llegada se habilita la cámara.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="h-11 flex-1 bg-acid-400 font-display text-sm uppercase tracking-wider text-ink-950"
            >
              Mostrar mi código
            </button>
            <button
              type="button"
              onClick={() => void refreshGuest()}
              disabled={refreshing}
              className="h-11 flex-1 border border-acid-400 font-display text-sm uppercase tracking-wider text-acid-400 disabled:opacity-60"
            >
              {refreshing ? 'Revisando...' : 'Ya me escanearon'}
            </button>
          </div>
        </section>
      )}

      <AnnouncementFeed posts={posts} />

      <RevealedRoll photos={revealed} />

      {showCamera && quota && (
        <CameraCapture
          token={token}
          quota={quota}
          onQuotaChange={setQuota}
          onClose={() => setShowCamera(false)}
          upload={upload}
          frames={cameraAssets.frames}
          stickers={cameraAssets.stickers}
          initialFrameId={cameraAssets.initialFrameId}
        />
      )}

      {showQr && <DoorCode token={token} guestName={guest.fullName} onClose={() => setShowQr(false)} />}
    </div>
  );
}

/**
 * Código para la puerta: codifica solo el token (nunca una URL ni datos
 * personales). El escáner del organizador (`extractTokenFromQrText`) acepta
 * el token "pelado".
 */
function DoorCode({ token, guestName, onClose }: { token: string; guestName: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(token, { margin: 4, width: 320 })
      .then((url) => active && setDataUrl(url))
      .catch(() => active && setDataUrl(null));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div
      role="dialog"
      aria-label="Tu código para la puerta"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink-950/95 px-6"
    >
      <p className="font-display text-xl uppercase tracking-wide text-paper-100">{guestName}</p>
      {dataUrl ? (
        <img src={dataUrl} alt="Código QR para la puerta" className="h-64 w-64 bg-white p-1" />
      ) : (
        <p className="font-mono text-xs uppercase tracking-widest text-acid-400">Generando código...</p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="h-11 bg-acid-400 px-6 font-display text-sm uppercase tracking-wider text-ink-950"
      >
        Listo
      </button>
    </div>
  );
}
