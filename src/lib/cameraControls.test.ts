import { describe, expect, it } from 'vitest';
import { getCameraControlsAvailability } from './cameraControls';

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
