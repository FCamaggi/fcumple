import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PREVIEW_MESSAGE_TYPE,
  PREVIEW_NOTE_TYPE,
  PREVIEW_READY_TYPE,
  parsePreviewNote,
  type PreviewDraftPost,
  type PreviewState,
} from '../lib/guestPreview';

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const MIN_SCALE = 0.5;

/** Cuánto se reduce el teléfono para caber en `available` px de ancho: nunca se agranda ni baja de la mitad. */
export function fitScale(available: number): number {
  if (!(available > 0)) return 1;
  return Math.max(MIN_SCALE, Math.min(1, available / PHONE_WIDTH));
}

interface PhoneFrameProps {
  /** Dirección de `GuestPreviewPage`. Cambiar el estado no la recarga: se avisa por mensaje. */
  src: string;
  /** Nombre del estado, para el título accesible del iframe. */
  label: string;
  state: PreviewState;
  /** Quien lo use debe memorizarlo: cada objeto nuevo se vuelve a mandar al iframe. */
  draft?: PreviewDraftPost | null;
  /** La nota que acompaña al estado (qué es de ejemplo, qué falta). */
  onNote?: (note: string | null) => void;
}

/**
 * Un teléfono de 390×844 con la pantalla del invitado dentro de un iframe. El iframe es una página de la propia app
 * (mismo origen), así que las reglas de pantalla miden un teléfono y no la ventana del panel; el panel y el iframe
 * solo hablan por mensajes validados. `sandbox` impide que la vista previa navegue el panel o abra ventanas.
 */
export default function PhoneFrame({ src, label, state, draft = null, onNote }: PhoneFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const onNoteRef = useRef(onNote);
  onNoteRef.current = onNote;

  const send = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: PREVIEW_MESSAGE_TYPE, state, draft },
      window.location.origin,
    );
  }, [state, draft]);

  useEffect(() => {
    send();
  }, [send]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.source === null || e.source !== iframeRef.current?.contentWindow) return;
      if (typeof e.data === 'object' && e.data !== null && (e.data as { type?: unknown }).type === PREVIEW_READY_TYPE) {
        send();
        return;
      }
      if (typeof e.data === 'object' && e.data !== null && (e.data as { type?: unknown }).type === PREVIEW_NOTE_TYPE) {
        const parsed = parsePreviewNote(e.data);
        if (parsed) onNoteRef.current?.(parsed.note);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [send]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    setScale(fitScale(box.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setScale(fitScale(box.clientWidth)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boxRef} className="flex w-full justify-center">
      <div
        className="shrink-0 overflow-hidden border border-smoke-700/60 bg-ink-950"
        style={{ width: PHONE_WIDTH * scale + 2, height: PHONE_HEIGHT * scale + 2 }}
      >
        <iframe
          ref={iframeRef}
          title={`Vista previa: ${label}`}
          src={src}
          sandbox="allow-scripts allow-same-origin"
          onLoad={send}
          className="block border-0"
          style={{
            width: PHONE_WIDTH,
            height: PHONE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  );
}
