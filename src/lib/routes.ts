/**
 * Datos de "Cómo llegar" (`/como-llegar`). Viven en código a propósito: es un
 * solo evento y una sola casa, así que editar una ruta es tocar este archivo.
 * Los pasos están escritos a mano (fuente de verdad); `mapsUrl` es solo un
 * apoyo -- Google Maps en modo transporte público puede proponer otra micro.
 */

export type RouteMode = 'uber' | 'bus' | 'walk';

export interface HowToRoute {
  id: string;
  mode: RouteMode;
  title: string;
  origin: string;
  duration: string;
  summary: string;
  steps: string[];
  /** Micros involucradas (solo mode 'bus'), para mostrarlas como chips. */
  lines?: string[];
  note?: string;
  mapsUrl: string;
}

export const DESTINATION_ADDRESS = 'Pasaje Argentina 2299, Independencia, Santiago, Chile';
export const DESTINATION_LABEL = 'Pasaje Argentina 2299, Independencia';
export const ARRIVAL_HINT = 'Vivo al final del pasaje, la casa de la derecha.';

export const MODE_LABELS: Record<RouteMode, string> = {
  bus: 'En micro',
  uber: 'En auto / Uber',
  walk: 'Caminando',
};

// Orden en que se muestran los grupos en la página.
export const MODE_ORDER: RouteMode[] = ['bus', 'uber', 'walk'];

const TRAVEL_MODE: Record<RouteMode, string> = {
  bus: 'transit',
  uber: 'driving',
  walk: 'walking',
};

export function buildMapsUrl(origin: string, mode: RouteMode): string {
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination: DESTINATION_ADDRESS,
    travelmode: TRAVEL_MODE[mode],
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildDestinationUrl(): string {
  const params = new URLSearchParams({ api: '1', query: DESTINATION_ADDRESS });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

const METRO_HOSPITALES = 'Metro Hospitales, Independencia, Santiago, Chile';
const METRO_CONCHALI = 'Metro Conchalí, Santiago, Chile';

const ROUTE_DEFS: Omit<HowToRoute, 'mapsUrl'>[] = [
  {
    id: 'micro-214-b10-hospitales',
    mode: 'bus',
    title: '214 o B10 desde Metro Hospitales',
    origin: METRO_HOSPITALES,
    duration: '~25 min',
    summary: 'Caminas a un paradero, 5 paradas en micro y una caminata corta.',
    lines: ['214', 'B10'],
    steps: [
      'Sal del Metro Hospitales y camina ~5 min (350 m) hasta el paradero PB387 (Parada 4 / Hospital Clínico).',
      'Toma la 214 o la B10 (5 paradas, unos 6 min).',
      'Bájate en el paradero PB873 (Av. Fermín Vivaceta).',
      'Camina ~4 min (300 m): por Padre Las Casas, luego Capitán Bynon y entra a Pje. Argentina.',
    ],
  },
  {
    id: 'micro-b17-hospitales',
    mode: 'bus',
    title: 'B17 desde Metro Hospitales',
    origin: METRO_HOSPITALES,
    duration: '~27 min',
    summary: 'Caminas a Domingo Santa María, 3 paradas en micro y más caminata al final.',
    lines: ['B17'],
    steps: [
      'Sal del Metro Hospitales y camina ~4 min (300 m) por Bezanilla/Prof. Zañartu hasta Av. Domingo Santa María.',
      'Toma la B17 en el paradero PB1565 (Domingo Santa María) — son 3 paradas, unos 3 min.',
      'Bájate en el paradero PB1328 (Domingo Santa María).',
      'Camina ~7 min (550 m) por Av. Fermín Vivaceta, luego Capitán Bynon y entra a Pje. Argentina.',
    ],
    note: 'Es el paradero que te deja más lejos: la caminata final es la más larga de las micros.',
  },
  {
    id: 'micro-b10-conchali',
    mode: 'bus',
    title: 'B10 desde Metro Conchalí',
    origin: METRO_CONCHALI,
    duration: '~26 min',
    summary: 'El paradero está pegado al metro; después una caminata corta hasta la esquina.',
    lines: ['B10'],
    steps: [
      'Sal del Metro Conchalí y camina 1 min (75 m) hasta el paradero PB16 (Parada 2 / Metro Conchalí).',
      'Toma la B10 (6 paradas, unos 9 min).',
      'Bájate en el paradero PB858 (Av. Fermín Vivaceta).',
      'Camina ~4 min (300 m): por Padre Las Casas, luego Capitán Bynon y entra a Pje. Argentina.',
    ],
  },
  {
    id: 'uber-hospitales',
    mode: 'uber',
    title: 'Uber desde Metro Hospitales',
    origin: METRO_HOSPITALES,
    duration: '~7 min',
    summary: 'El más rápido desde Hospitales.',
    steps: ['Pide el viaje con destino Pasaje Argentina 2299, Independencia.'],
    note: 'El precio y el tiempo dependen de la tarifa según el día y la hora.',
  },
  {
    id: 'uber-conchali',
    mode: 'uber',
    title: 'Uber desde Plaza Conchalí',
    origin: METRO_CONCHALI,
    duration: '~5 min',
    summary: 'Muy cerca en auto desde Conchalí.',
    steps: ['Pide el viaje con destino Pasaje Argentina 2299, Independencia.'],
    note: 'El precio y el tiempo dependen de la tarifa según el día y la hora.',
  },
  {
    id: 'walk-domingo-santa-maria',
    mode: 'walk',
    title: 'A pie desde Metro Hospitales (por Domingo Santa María)',
    origin: METRO_HOSPITALES,
    duration: '19 min · 1,4 km',
    summary: 'Una sola salida del metro y directo hacia Domingo Santa María.',
    steps: [
      'Dirígete hacia Bezanilla/Prof. Zañartu.',
      'Gira a la izquierda hacia Av. Domingo Santa María.',
      'Gira a la derecha hacia Capitán Bynon.',
      'Gira a la izquierda hacia Pje. Argentina. El destino queda a la derecha.',
    ],
    note: 'No es lo más recomendable, pero se puede.',
  },
  {
    id: 'walk-bezanilla-vivaceta',
    mode: 'walk',
    title: 'A pie desde Metro Hospitales (por Bezanilla y Vivaceta)',
    origin: METRO_HOSPITALES,
    duration: '20 min · 1,5 km',
    summary: 'Alternativa por Bezanilla y Av. Fermín Vivaceta.',
    steps: [
      'Dirígete hacia Bezanilla/Prof. Zañartu.',
      'Gira a la izquierda hacia Bezanilla.',
      'Gira a la derecha hacia Av. Fermín Vivaceta.',
      'Gira a la izquierda hacia Av. Domingo Santa María.',
      'Gira a la derecha hacia Capitán Bynon.',
      'Gira a la izquierda hacia Pje. Argentina. El destino queda a la derecha.',
    ],
    note: 'No es lo más recomendable, pero se puede.',
  },
];

export const ROUTES: HowToRoute[] = ROUTE_DEFS.map((def) => ({
  ...def,
  mapsUrl: buildMapsUrl(def.origin, def.mode),
}));

export function routesByMode(mode: RouteMode): HowToRoute[] {
  return ROUTES.filter((r) => r.mode === mode);
}
