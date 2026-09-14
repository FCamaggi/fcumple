import { describe, expect, it } from 'vitest';
import { groupPhotosByHourBand } from './photoTimeline';

// Todos los timestamps son UTC reales; el evento es en Chile
// (America/Santiago, UTC-3 en horario de verano boreal/austral de octubre
// -- 22:00 hora Chile del 9 de octubre de 2026 es 01:00 UTC del 10). Las
// fechas de acá reflejan eso a propósito, para probar que el agrupamiento
// usa la hora de Chile, no la hora UTC cruda del timestamp.
describe('groupPhotosByHourBand', () => {
  it('agrupa fotos en bandas de 1 hora alineadas al reloj de Chile', () => {
    const photos = [
      { url: 'a.jpg', createdAt: '2026-10-10T01:10:00Z' }, // 22:10 Chile
      { url: 'b.jpg', createdAt: '2026-10-10T01:50:00Z' }, // 22:50 Chile
      { url: 'c.jpg', createdAt: '2026-10-10T02:05:00Z' }, // 23:05 Chile
    ];

    const bands = groupPhotosByHourBand(photos);

    expect(bands.map((b) => b.label)).toEqual(['22:00 — 23:00', '23:00 — 00:00']);
    expect(bands[0].photos.map((p) => p.url)).toEqual(['a.jpg', 'b.jpg']);
    expect(bands[1].photos.map((p) => p.url)).toEqual(['c.jpg']);
  });

  it('ordena las bandas de más temprano a más tarde, sin importar el orden de entrada', () => {
    const photos = [
      { url: 'late.jpg', createdAt: '2026-10-10T03:00:00Z' }, // 00:00 Chile
      { url: 'early.jpg', createdAt: '2026-10-10T01:00:00Z' }, // 22:00 Chile
    ];

    const bands = groupPhotosByHourBand(photos);

    expect(bands.map((b) => b.label)).toEqual(['22:00 — 23:00', '00:00 — 01:00']);
  });

  it('ordena las fotos dentro de cada banda de más vieja a más nueva, sin mutar el input', () => {
    const photos = [
      { url: 'newer.jpg', createdAt: '2026-10-10T01:40:00Z' },
      { url: 'older.jpg', createdAt: '2026-10-10T01:10:00Z' },
    ];
    const originalOrder = photos.map((p) => p.url);

    const bands = groupPhotosByHourBand(photos);

    expect(bands[0].photos.map((p) => p.url)).toEqual(['older.jpg', 'newer.jpg']);
    expect(photos.map((p) => p.url)).toEqual(originalOrder);
  });

  it('nunca muestra una banda sin fotos, incluso si hay un salto de horas entre fotos', () => {
    const photos = [
      { url: 'a.jpg', createdAt: '2026-10-10T01:00:00Z' }, // 22:00 Chile
      { url: 'b.jpg', createdAt: '2026-10-10T05:00:00Z' }, // 02:00 Chile (3 bandas después)
    ];

    const bands = groupPhotosByHourBand(photos);

    expect(bands).toHaveLength(2);
    expect(bands.map((b) => b.label)).toEqual(['22:00 — 23:00', '02:00 — 03:00']);
  });

  it('devuelve un array vacío sin fotos', () => {
    expect(groupPhotosByHourBand([])).toEqual([]);
  });

  it('etiqueta correctamente una banda que cruza medianoche', () => {
    const photos = [{ url: 'a.jpg', createdAt: '2026-10-10T03:30:00Z' }]; // 00:30 Chile

    const bands = groupPhotosByHourBand(photos);

    expect(bands[0].label).toBe('00:00 — 01:00');
  });
});
