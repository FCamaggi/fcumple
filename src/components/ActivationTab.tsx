import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import PanelState from './PanelState';
import { rotateActivationCode, type OrganizerEvent } from '../lib/organizerApi';

interface ActivationTabProps {
  event: OrganizerEvent;
  onEventChange: (event: OrganizerEvent) => void;
}

/**
 * ActivationTab — el QR de la fiesta. La cámara de los invitados se habilita cuando escanean este código con la
 * cámara de su celular (lleva a `/e/:slug/a/:código`); no basta con inscribirse. Es UN código por evento: se
 * imprime y se deja en el lugar. Si alguien lo reenvía a quien no está, «Cambiar el código» deja de servir al QR
 * impreso (quienes ya activaron su cámara siguen activados).
 */
export default function ActivationTab({ event, onEventChange }: ActivationTabProps) {
  const url = `${window.location.origin}/e/${event.slug}/a/${event.activationCode}`;
  const [qr, setQr] = useState<string | null>(null);
  // Si el QR no se puede dibujar hay que decirlo: es lo que se imprime. El mensaje es fijo (la dirección lleva el código).
  const [qrFailed, setQrFailed] = useState(false);
  const [qrKey, setQrKey] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setQrFailed(false);
    QRCode.toDataURL(url, { margin: 4, width: 800 })
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setQr(null);
          setQrFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, qrKey]);

  async function handleRotate() {
    if (
      !window.confirm(
        'Si cambias el código, el QR que ya imprimiste dejará de servir y tendrás que imprimir el nuevo. ' +
          'Quienes ya activaron su cámara siguen activados. ¿Cambiarlo?',
      )
    ) {
      return;
    }
    setMessage(null);
    setRotating(true);
    try {
      const code = await rotateActivationCode(event.id);
      onEventChange({ ...event, activationCode: code });
      setMessage({ kind: 'ok', text: 'Cambiaste el código. Descarga e imprime el QR nuevo.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No pudimos cambiar el código.' });
    } finally {
      setRotating(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-label="QR de activación de la cámara">
      {event.cameraUnlock !== 'on_event_qr' && (
        <p className="border border-flame-500 px-3 py-2 font-sans text-sm text-paper-100">
          Tu evento no usa el QR de la fiesta: hoy la cámara se habilita de otra forma. Para usar este QR, entra a
          Ajustes y elige «Cuando escanee el QR de la fiesta» en «La cámara se habilita».
        </p>
      )}

      <p className="font-sans text-sm text-paper-100/80">
        Imprime este código y ponlo en la fiesta (la entrada, la barra). Cada invitado lo escanea con la cámara de su
        celular y se le activa la cámara de fotos. Sin escanearlo no pueden sacar fotos, aunque ya estén inscritos.
      </p>

      {qrFailed && (
        <PanelState kind="error" onRetry={() => setQrKey((k) => k + 1)}>
          No pudimos generar el QR.
        </PanelState>
      )}

      {qr && (
        <div className="flex flex-col items-start gap-2">
          <img src={qr} alt="Código QR de activación de la cámara" className="h-56 w-56 bg-white p-1" />
          <div className="flex flex-wrap items-center gap-4">
            <a
              href={qr}
              download={`qr-activacion-${event.slug}.png`}
              className="inline-flex min-h-11 items-center font-mono text-xs uppercase tracking-wider text-laser-500 underline"
            >
              Descargar QR
            </a>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center font-mono text-xs uppercase tracking-wider text-laser-500 underline"
            >
              Probar el QR
            </a>
          </div>
        </div>
      )}

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`font-mono text-xs uppercase tracking-wide ${
            message.kind === 'error' ? 'text-flame-500' : 'text-acid-400'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => void handleRotate()}
          disabled={rotating}
          className="h-10 w-fit border border-smoke-700/60 px-4 font-mono text-xs uppercase tracking-wider text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-400 disabled:opacity-60"
        >
          {rotating ? 'Cambiando...' : 'Cambiar el código'}
        </button>
        <p className="font-sans text-xs text-paper-100/60">
          Úsalo solo si alguien reenvió la foto del QR a quien no está en la fiesta.
        </p>
      </div>
    </section>
  );
}
