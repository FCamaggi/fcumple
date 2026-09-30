import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ARRIVAL_HINT,
  DESTINATION_LABEL,
  MODE_LABELS,
  MODE_ORDER,
  buildDestinationUrl,
  routesByMode,
  type HowToRoute,
} from '../lib/routes';

/**
 * `/como-llegar` — página pública con las formas de llegar a la fiesta. Los
 * datos vienen de `lib/routes.ts`; acá solo se presentan.
 */
export default function HowToGetTherePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 px-4 pb-16 pt-8">
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-laser-500/20 blur-[90px]"
        aria-hidden
      />
      <div className="film-grain pointer-events-none absolute inset-0 opacity-[0.03]" aria-hidden />

      <div className="relative mx-auto flex max-w-md flex-col gap-5">
        <header className="flex flex-col gap-1 text-center">
          <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">El mapa // abierto para todos</span>
          <h1 className="font-display text-4xl uppercase leading-none tracking-wide text-paper-100">Cómo llegar</h1>
        </header>

        <AddressCard />

        {MODE_ORDER.map((mode) => (
          <section key={mode} className="flex flex-col gap-3" aria-label={MODE_LABELS[mode]}>
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-hotpink-500">{MODE_LABELS[mode]}</h2>
            {routesByMode(mode).map((route) => (
              <RouteCard key={route.id} route={route} />
            ))}
          </section>
        ))}

        <Link
          to="/evento"
          className="tap-target flex items-center justify-center bg-laser-500/10 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500"
        >
          Volver a la cartelera
        </Link>
      </div>
    </div>
  );
}

function AddressCard() {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(DESTINATION_LABEL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: la dirección sigue visible en pantalla.
    }
  }

  return (
    <section className="flex flex-col gap-3 border border-smoke-700/50 bg-ink-900 p-4" aria-label="Dirección">
      <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">Destino</span>
      <p className="font-display text-2xl uppercase leading-tight tracking-wide text-paper-100">{DESTINATION_LABEL}</p>
      <p className="font-sans text-sm text-paper-100/80">{ARRIVAL_HINT}</p>
      <div className="flex gap-2">
        <a
          href={buildDestinationUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-target flex flex-1 items-center justify-center bg-acid-400 px-3 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950"
        >
          Abrir en Maps
        </a>
        <button
          type="button"
          onClick={copyAddress}
          className="tap-target flex flex-1 items-center justify-center bg-laser-500/10 px-3 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500"
        >
          {copied ? 'Copiada' : 'Copiar dirección'}
        </button>
      </div>
    </section>
  );
}

function RouteCard({ route }: { route: HowToRoute }) {
  return (
    <article className="flex flex-col gap-3 border border-smoke-700/50 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-sans text-base font-bold text-paper-100">{route.title}</h3>
        <span className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-wider text-acid-400">{route.duration}</span>
      </div>

      {route.lines && (
        <ul className="flex gap-2" aria-label="Micros">
          {route.lines.map((line) => (
            <li key={line} className="bg-flame-500 px-2 py-0.5 font-display text-sm tracking-wide text-ink-950">
              {line}
            </li>
          ))}
        </ul>
      )}

      <p className="font-sans text-sm text-paper-100/70">{route.summary}</p>

      <ol className="flex list-decimal flex-col gap-1.5 pl-5 font-sans text-sm text-paper-100/90">
        {route.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {route.note && <p className="font-mono text-[11px] uppercase tracking-wider text-hotpink-500">{route.note}</p>}

      <a
        href={route.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-target flex items-center justify-center bg-laser-500/10 px-3 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500"
      >
        Ver en Google Maps
      </a>
    </article>
  );
}
