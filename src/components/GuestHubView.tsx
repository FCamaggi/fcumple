import AnnouncementFeed from './AnnouncementFeed';
import CameraSection from './CameraSection';
import PhotoCarousel from './PhotoCarousel';
import RevealedRoll, { type RawRevealedPhoto } from './RevealedRoll';
import WishlistSection from './WishlistSection';
import type { CameraUnlock } from '../lib/platformApi';
import type { WishlistConfig } from '../lib/wishlist';
import type { PhotoQuota, Post } from '../types';

export interface GuestHubViewProps {
  cameraUnlock: CameraUnlock;
  cameraUnlocked: boolean;
  /** Marcos y stickers ya cargados: antes de eso no se ofrece abrir la cámara. */
  cameraReady: boolean;
  headcount: number | null;
  quota: PhotoQuota | null;
  posts: Post[];
  revealed: RawRevealedPhoto[];
  wishlist?: WishlistConfig;
  refreshing: boolean;
  onOpenCamera: () => void;
  onShowQr: () => void;
  onRefresh: () => void;
}

/**
 * La cartelera del invitado sin estado ni llamadas: todo entra por props. `GuestHub` la alimenta con las RPC del
 * invitado; la vista previa de la organizadora, con datos de ejemplo. Así lo que ella ve es el mismo código que
 * ve el invitado.
 */
export default function GuestHubView({
  cameraUnlock,
  cameraUnlocked,
  cameraReady,
  headcount,
  quota,
  posts,
  revealed,
  wishlist,
  refreshing,
  onOpenCamera,
  onShowQr,
  onRefresh,
}: GuestHubViewProps) {
  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      {headcount !== null && headcount > 0 && (
        <p className="text-center font-mono text-xs uppercase tracking-widest text-hotpink-500">
          Aforo // {headcount} inscritos
        </p>
      )}

      {cameraUnlocked && quota && cameraReady && <CameraSection quota={quota} onOpen={onOpenCamera} />}

      {!cameraUnlocked && cameraUnlock === 'on_event_qr' && (
        <section className="flex flex-col gap-3 bg-ink-900 p-4 shadow-2xl" aria-label="Cámara bloqueada">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-hotpink-500">
            Cámara // aún bloqueada
          </span>
          <p className="font-sans text-sm text-paper-100/80">
            Escanea el código QR de la fiesta con la cámara de tu celular para activar la cámara. Lo encuentras impreso en
            el lugar del evento.
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-11 border border-acid-400 font-display text-sm uppercase tracking-wider text-acid-400 disabled:opacity-60"
          >
            {refreshing ? 'Revisando...' : 'Ya escaneé el código'}
          </button>
        </section>
      )}

      {!cameraUnlocked && cameraUnlock !== 'on_event_qr' && (
        <section className="flex flex-col gap-3 bg-ink-900 p-4 shadow-2xl" aria-label="Cámara bloqueada">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-hotpink-500">
            Cámara // aún bloqueada
          </span>
          <p className="font-sans text-sm text-paper-100/80">
            Muestra tu código en la puerta. Cuando marquen tu llegada se habilita la cámara.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onShowQr}
              className="h-11 flex-1 bg-acid-400 font-display text-sm uppercase tracking-wider text-ink-950"
            >
              Mostrar mi código
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-11 flex-1 border border-acid-400 font-display text-sm uppercase tracking-wider text-acid-400 disabled:opacity-60"
            >
              {refreshing ? 'Revisando...' : 'Ya me escanearon'}
            </button>
          </div>
        </section>
      )}

      <WishlistSection wishlist={wishlist} />

      <AnnouncementFeed posts={posts} />

      <PhotoCarousel photos={revealed} />

      <RevealedRoll photos={revealed} />
    </div>
  );
}
