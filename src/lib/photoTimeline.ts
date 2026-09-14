/**
 * photoTimeline -- agrupamiento del rollo revelado en bandas de 1 hora
 * (Etapa 9, Frente 3 del backlog). Extraído de RevealedRoll.tsx por el
 * mismo motivo que cameraControls.ts/photoModerationQueue.ts: lógica pura,
 * testable sin URLs de Storage reales ni tocar `Intl`/zona horaria desde el
 * componente.
 *
 * Las bandas están alineadas al reloj en horario de Chile
 * (America/Santiago), no relativas a la hora de la primera foto -- "22:00 —
 * 23:00", "23:00 — 00:00", etc. Solo se devuelven bandas con al menos una
 * foto.
 *
 * Etapa 10: `groupPhotosByHourBand` pasó a ser genérica sobre cualquier tipo
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

const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
});

// Devuelve la fecha (yyyy-mm-dd) y la hora (0-23) de una foto en horario de
// Chile. `Intl` ya resuelve el offset correcto para la fecha dada (incluye
// cualquier cambio de horario de verano vigente en ese momento), así que no
// hace falta un cálculo manual de offset.
function chileDateAndHour(createdAt: string): { date: string; hour: number } {
  const parts = hourFormatter.formatToParts(new Date(createdAt));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // El formateador en horario de medianoche exacta devuelve hora "24", no
  // "00" (convención de Intl con hour12: false) -- se normaliza para que la
  // banda quede correctamente etiquetada "00:00 — 01:00".
  const hour = Number(get('hour')) % 24;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function bandLabel(hour: number): string {
  const nextHour = (hour + 1) % 24;
  return `${pad(hour)}:00 — ${pad(nextHour)}:00`;
}

export function groupPhotosByHourBand<T extends { createdAt: string }>(photos: T[]): PhotoTimelineBand<T>[] {
  const buckets = new Map<string, { hour: number; photos: T[] }>();

  for (const photo of photos) {
    const { date, hour } = chileDateAndHour(photo.createdAt);
    // La key incluye la fecha, no solo la hora, así dos noches distintas (o
    // un evento que cruza medianoche) nunca comparten banda aunque ambas
    // caigan, por ejemplo, en la hora "22".
    const key = `${date}T${pad(hour)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.photos.push(photo);
    } else {
      buckets.set(key, { hour, photos: [photo] });
    }
  }

  return [...buckets.entries()]
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([, bucket]) => ({
      label: bandLabel(bucket.hour),
      photos: [...bucket.photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
}
