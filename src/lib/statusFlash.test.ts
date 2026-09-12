import { describe, expect, it } from 'vitest';
import { shouldFlashOnStatusChange, STATUS_FLASH_COLOR } from './statusFlash';

describe('shouldFlashOnStatusChange', () => {
  it('does not flash on first render (no previous status known)', () => {
    expect(shouldFlashOnStatusChange(undefined, 'pending')).toBe(false);
    expect(shouldFlashOnStatusChange(undefined, 'confirmed')).toBe(false);
    expect(shouldFlashOnStatusChange(undefined, 'declined')).toBe(false);
  });

  it('does not flash when the status is unchanged', () => {
    expect(shouldFlashOnStatusChange('pending', 'pending')).toBe(false);
    expect(shouldFlashOnStatusChange('confirmed', 'confirmed')).toBe(false);
    expect(shouldFlashOnStatusChange('declined', 'declined')).toBe(false);
  });

  it('flashes when the status changes between any two distinct values', () => {
    expect(shouldFlashOnStatusChange('pending', 'confirmed')).toBe(true);
    expect(shouldFlashOnStatusChange('pending', 'declined')).toBe(true);
    expect(shouldFlashOnStatusChange('confirmed', 'declined')).toBe(true);
    expect(shouldFlashOnStatusChange('declined', 'confirmed')).toBe(true);
  });
});

describe('STATUS_FLASH_COLOR', () => {
  it('defines a flash color for every RSVP status', () => {
    expect(STATUS_FLASH_COLOR.confirmed).toBe('#c8ff3d');
    expect(STATUS_FLASH_COLOR.declined).toBe('#ff5a1f');
    expect(STATUS_FLASH_COLOR.pending).toBe('#3a3244');
  });
});
