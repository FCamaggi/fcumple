import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { eventUrl, whatsappMessage, whatsappShareUrl } from '../lib/eventLink';
import type { OrganizerEvent } from '../lib/organizerApi';

interface ShareEventLinkProps {
  event: Pick<OrganizerEvent, 'name' | 'slug'>;
}

/**
 * ShareEventLink — el enlace único del evento: copiar, mandar UN mensaje de
 * WhatsApp al grupo y descargar el QR para imprimir o proyectar. Reemplaza el
 * envío uno por uno de la Fase 0 (SendInviteButton).
 */
export default function ShareEventLink({ event }: ShareEventLinkProps) {
  const url = eventUrl(window.location.origin, event.slug);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 4, width: 640 })
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Enlace del evento">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">Enlace único del evento</span>
        <code className="break-all bg-ink-950 px-3 py-2 font-mono text-sm text-acid-400">{url}</code>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="h-10 bg-acid-400 px-4 font-display text-xs uppercase tracking-wider text-ink-950"
        >
          {copied ? 'Copiado' : 'Copiar enlace'}
        </button>
        <a
          href={whatsappShareUrl(whatsappMessage(event.name, url))}
          target="_blank"
          rel="noreferrer"
          className="flex h-10 items-center border border-acid-400 px-4 font-display text-xs uppercase tracking-wider text-acid-400"
        >
          Compartir por WhatsApp
        </a>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex h-10 items-center border border-smoke-700/60 px-4 font-display text-xs uppercase tracking-wider text-paper-100"
        >
          Probar el enlace
        </a>
      </div>

      <p className="font-sans text-xs text-paper-100/60">
        Manda el mismo enlace a todos (por ejemplo al grupo). Cada persona escribe su nombre y apellido y elige un PIN de 4 a 6 números para entrar. Con «Probar el enlace» ves lo mismo que verán tus invitados.
      </p>

      {qr && (
        <div className="flex flex-col items-start gap-2">
          <img src={qr} alt={`Código QR de ${event.name}`} className="h-48 w-48 bg-white p-1" />
          <a
            href={qr}
            download={`qr-${event.slug}.png`}
            className="font-mono text-[11px] uppercase tracking-wider text-laser-500 underline"
          >
            Descargar QR
          </a>
        </div>
      )}
    </section>
  );
}
