/**
 * photoTimeline -- agrupamiento del rollo revelado en bandas de tiempo
 * (Etapa 9, Frente 3 del backlog). El intervalo lo elige la organizadora por
 * evento (`events.roll_band_minutes`, 1 hora por defecto). Extraído de RevealedRoll.tsx por el
 * mismo motivo que cameraControls.ts/photoModerationQueue.ts: lógica pura,
 * testable sin URLs de Storage reales ni tocar `Intl`/zona horaria desde el
 * componente.
 *
 * Las bandas están alineadas al reloj en horario de Chile
 * (America/Santiago) y contadas desde la medianoche, no relativas a la hora
 * de la primera foto -- "22:00 — 23:00", o "22:00 — 22:30" con 30 minutos.
 * Solo se devuelven bandas con al menos una foto.
 *
 * Etapa 10: la agrupación (hoy `groupPhotosByTimeBand`) pasó a ser genérica sobre cualquier tipo
 * con `createdAt` -- RevealedRoll ahora la usa tanto sobre datos crudos
 * (`storagePath`+`createdAt`, antes de resolver ninguna URL) como, en los
 * tests preexistentes de este archivo, sobre `TimelinePhoto` (`url`). La
 * agrupación en sí no necesita saber si la URL ya está resuelta.
 */

const TIME_ZONE = 'America/Santiago';

export interface TimelinePhoto {
  url: string;
  createdAt: string;
}

export interface PhotoTimelineBand<T extends { createdAt: string } = TimelinePhoto> {
  label: string;
  photos: T[];
}

/**
 * Intervalos que puede elegir la organizadora, en minutos. Todos dividen el día exacto, así las bandas
 * contadas desde la medianoche nunca quedan cortadas. Debe coincidir con el check de la migración
 * 20261113100027_roll_band_minutes.sql.
 */
export const ROLL_BAND_MINUTES = [15, 30, 60, 90, 120, 180] as const;
export type RollBandMinutes = (typeof ROLL_BAND_MINUTES)[number];
export const DEFAULT_ROLL_BAND_MINUTES: RollBandMinutes = 60;

export function isRollBandMinutes(value: unknown): value is RollBandMinutes {
  return (ROLL_BAND_MINUTES as readonly unknown[]).includes(value);
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

// Devuelve la fecha (yyyy-mm-dd) y el minuto del día (0-1439) de una foto en
// horario de Chile. `Intl` ya resuelve el offset correcto para la fecha dada
// (incluye cualquier cambio de horario de verano vigente en ese momento), así
// que no hace falta un cálculo manual de offset.
function chileDateAndMinute(createdAt: string): { date: string; minute: number } {
  const parts = timeFormatter.formatToParts(new Date(createdAt));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // El formateador en horario de medianoche exacta devuelve hora "24", no
  // "00" (convención de Intl con hour12: false) -- se normaliza para que la
  // banda quede correctamente etiquetada "00:00 — 01:00".
  const hour = Number(get('hour')) % 24;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: hour * 60 + Number(get('minute')) };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function clock(minuteOfDay: number): string {
  const m = minuteOfDay % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function bandLabel(start: number, bandMinutes: number): string {
  return `${clock(start)} — ${clock(start + bandMinutes)}`;
}

/**
 * Agrupa las fotos en bandas de `bandMinutes` minutos. Un valor fuera de `ROLL_BAND_MINUTES` (por ejemplo, un
 * evento anterior a la columna) vuelve a 1 hora.
 */
export function groupPhotosByTimeBand<T extends { createdAt: string }>(
  photos: T[],
  bandMinutes: number = DEFAULT_ROLL_BAND_MINUTES,
): PhotoTimelineBand<T>[] {
  const size = isRollBandMinutes(bandMinutes) ? bandMinutes : DEFAULT_ROLL_BAND_MINUTES;
  const buckets = new Map<string, { start: number; photos: T[] }>();

  for (const photo of photos) {
    const { date, minute } = chileDateAndMinute(photo.createdAt);
    const start = minute - (minute % size);
    // La key incluye la fecha, no solo el inicio, así dos noches distintas (o
    // un evento que cruza medianoche) nunca comparten banda aunque ambas
    // empiecen, por ejemplo, a las "22:00".
    const key = `${date}T${pad(Math.floor(start / 60))}:${pad(start % 60)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.photos.push(photo);
    } else {
      buckets.set(key, { start, photos: [photo] });
    }
  }

  return [...buckets.entries()]
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([, bucket]) => ({
      label: bandLabel(bucket.start, size),
      photos: [...bucket.photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
}
