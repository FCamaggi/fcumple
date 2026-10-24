import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import CameraCapture from './CameraCapture';
import GuestHubView from './GuestHubView';
import { type RawRevealedPhoto } from './RevealedRoll';
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

  // Cada modo tiene su propio desbloqueo: al inscribirse, al marcar la llegada el organizador, o al escanear el
  // QR impreso de la fiesta (`/e/:slug/a/:code`). Es solo la cara visible: submit_photo lo exige en la base.
  const cameraUnlocked =
    event.cameraUnlock === 'on_identify' ||
    (event.cameraUnlock === 'on_checkin' && guest.checkedInAt !== null) ||
    (event.cameraUnlock === 'on_event_qr' && guest.cameraActivatedAt !== null);
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

  // Las fotos publicadas por la organizadora: se piden siempre (ella puede publicar un lote con esta página abierta)
  // y se vuelven a pedir cada minuto mientras la página está a la vista. Solo es la lista; las imágenes se piden
  // de a una, cuando entran en pantalla.
  useEffect(() => {
    let active = true;
    const load = (initial: boolean) =>
      listRevealedPhotosForGuest(token)
        .then((photos) => active && setRevealed(photos))
        .catch(() => active && initial && setRevealed([]));
    void load(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(false);
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token]);

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
      <GuestHubView
        cameraUnlock={event.cameraUnlock}
        cameraUnlocked={cameraUnlocked}
        cameraReady={cameraReady}
        headcount={headcount}
        quota={quota}
        posts={posts}
        revealed={revealed}
        refreshing={refreshing}
        onOpenCamera={() => setShowCamera(true)}
        onShowQr={() => setShowQr(true)}
        onRefresh={() => void refreshGuest()}
      />

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
      className="fixed inset-safe z-50 flex flex-col items-center justify-center gap-4 bg-ink-950/95 px-6"
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
