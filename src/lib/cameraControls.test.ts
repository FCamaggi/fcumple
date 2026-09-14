import { describe, expect, it } from 'vitest';
import { getCameraControlsAvailability, getZoomPresets } from './cameraControls';

describe('getCameraControlsAvailability', () => {
  it('hides both controls when there are no capabilities at all (Safari, no getCapabilities())', () => {
    expect(getCameraControlsAvailability(null)).toEqual({ zoom: null, torch: false });
    expect(getCameraControlsAvailability(undefined)).toEqual({ zoom: null, torch: false });
  });

  it('hides both controls when capabilities exist but report neither zoom nor torch', () => {
    expect(getCameraControlsAvailability({ facingMode: ['environment'] })).toEqual({
      zoom: null,
      torch: false,
    });
  });

  it('exposes the zoom range when the device reports it, defaulting a missing step to 0.1', () => {
    expect(getCameraControlsAvailability({ zoom: { min: 1, max: 5 } })).toEqual({
      zoom: { min: 1, max: 5, step: 0.1 },
      torch: false,
    });
  });

  it('keeps an explicit zoom step instead of overriding it', () => {
    expect(getCameraControlsAvailability({ zoom: { min: 1, max: 8, step: 0.5 } })).toEqual({
      zoom: { min: 1, max: 8, step: 0.5 },
      torch: false,
    });
  });

  it('exposes torch when the device reports it', () => {
    expect(getCameraControlsAvailability({ torch: true })).toEqual({ zoom: null, torch: true });
  });

  it('exposes both together when both are reported', () => {
    expect(getCameraControlsAvailability({ zoom: { min: 1, max: 3, step: 0.1 }, torch: true })).toEqual({
      zoom: { min: 1, max: 3, step: 0.1 },
      torch: true,
    });
  });
});

describe('getZoomPresets', () => {
  it('returns [min, midpoint, max] for a normal range', () => {
    expect(getZoomPresets({ min: 1, max: 5, step: 0.1 })).toEqual([1, 3, 5]);
  });

  it('keeps three distinct values even with an uneven range', () => {
    expect(getZoomPresets({ min: 1, max: 8, step: 0.5 })).toEqual([1, 4.5, 8]);
  });

  it('collapses to a single midpoint chip when the range cannot fit two step-separated values', () => {
    expect(getZoomPresets({ min: 2, max: 2.05, step: 0.1 })).toEqual([2.025]);
  });

  it('collapses to a single chip when min equals max', () => {
    expect(getZoomPresets({ min: 3, max: 3, step: 0.1 })).toEqual([3]);
  });

  it('collapses to a single chip when min equals max even with an explicit step of 0 (would otherwise produce duplicate React keys)', () => {
    // Regresión: `max - min < step` da `0 < 0 = false` cuando step es 0
    // explícito (no ausente) -- sin el chequeo adicional de `max - min <= 0`
    // esto devolvía [3, 3, 3], tres chips con la misma key en ZoomChips.
    expect(getZoomPresets({ min: 3, max: 3, step: 0 })).toEqual([3]);
  });
});
