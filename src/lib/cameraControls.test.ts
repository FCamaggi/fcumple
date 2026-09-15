import { describe, expect, it } from 'vitest';
import { getCameraControlsAvailability } from './cameraControls';

describe('getCameraControlsAvailability', () => {
  it('hides torch when there are no capabilities at all (Safari, no getCapabilities())', () => {
    expect(getCameraControlsAvailability(null)).toEqual({ torch: false });
    expect(getCameraControlsAvailability(undefined)).toEqual({ torch: false });
  });

  it('hides torch when capabilities exist but do not report it', () => {
    expect(getCameraControlsAvailability({ facingMode: ['environment'] })).toEqual({ torch: false });
  });

  it('exposes torch when the device reports it', () => {
    expect(getCameraControlsAvailability({ torch: true })).toEqual({ torch: true });
  });
});
