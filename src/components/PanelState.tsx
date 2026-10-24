import type { ReactNode } from 'react';

type PanelStateProps =
  | { kind: 'loading'; children: ReactNode }
  | { kind: 'empty'; children: ReactNode }
  | { kind: 'error'; children: ReactNode; /** Sin él no se ofrece «Reintentar». */ onRetry?: () => void };

const retryClass =
  'h-11 border border-acid-400 px-5 font-display text-sm uppercase tracking-wider text-acid-400';

/**
 * Los tres estados que toda pestaña del panel que carga datos debe tener: cargando (`role="status"`), vacío (qué
 * pasa y qué hacer) y error (`role="alert"`, con «Reintentar» si se le da cómo). Un solo lugar para que se vean y
 * se lean igual en todas; la pestaña «Hoy» es el modelo del que sale.
 */
export default function PanelState(props: PanelStateProps) {
  if (props.kind === 'loading') {
    return (
      <p role="status" className="font-mono text-xs uppercase tracking-widest text-paper-100/70">
        {props.children}
      </p>
    );
  }
  if (props.kind === 'empty') {
    return <p className="font-sans text-sm text-paper-100/80">{props.children}</p>;
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
        {props.children}
      </p>
      {props.onRetry && (
        <button type="button" onClick={props.onRetry} className={retryClass}>
          Reintentar
        </button>
      )}
    </div>
  );
}
