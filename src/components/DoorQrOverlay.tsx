import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface DoorQrOverlayProps {
  token: string;
  onClose: () => void;
}

/**
 * DoorQrOverlay — el QR real de pantalla completa que el invitado le
 * muestra al admin en la puerta. El único cierre posible es el botón
 * "Cerrar" -- a propósito, sin dismiss por backdrop ni por Escape: cada vez
 * que se cierra, quien llama a este componente (GuestPage) vuelve a pedir
 * el estado del invitado. Si lo escanearon mientras el QR estaba abierto,
 * cerrar con el botón es lo que "revela" que la cámara ya se desbloqueó,
 * sin depender de que el invitado piense en recargar la página a mano.
 */
export default function DoorQrOverlay({ token, onClose }: DoorQrOverlayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const link = `${window.location.origin}/i/${token}`;
    QRCode.toDataURL(link, { margin: 1, width: 320 })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div
      role="dialog"
      aria-label="Tu QR de puerta"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-ink-950 px-4 text-center"
    >
      <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">
        Mostrale esto a la puerta
      </span>

      <div className="flex h-72 w-72 items-center justify-center bg-paper-100 p-4">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Tu código de acceso" className="h-full w-full" />
        ) : (
          <span className="font-mono text-xs text-ink-950">Generando...</span>
        )}
      </div>

      <p className="max-w-xs font-sans text-sm text-paper-100/70">
        Cuando te reconozcan, cerrá esta pantalla con el botón de abajo.
      </p>

      <button
        type="button"
        onClick={onClose}
        className="tap-target h-14 w-full max-w-xs bg-acid-400 font-display text-lg uppercase tracking-wider text-ink-950 shadow-glow-acid transition-transform active:scale-[0.98]"
      >
        Cerrar
      </button>
    </div>
  );
}
