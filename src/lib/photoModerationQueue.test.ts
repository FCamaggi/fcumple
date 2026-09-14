import { describe, expect, it } from 'vitest';
import { getModerationDecisionFromSwipe, sortPhotosForTriage } from './photoModerationQueue';

describe('sortPhotosForTriage', () => {
  it('orders oldest first, opposite of listAllPhotosForModeration', () => {
    const photos = [
      { id: 'c', createdAt: '2026-06-01T12:00:00Z' },
      { id: 'a', createdAt: '2026-06-01T09:00:00Z' },
      { id: 'b', createdAt: '2026-06-01T10:00:00Z' },
    ];

    expect(sortPhotosForTriage(photos).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const photos = [
      { id: 'b', createdAt: '2026-06-01T10:00:00Z' },
      { id: 'a', createdAt: '2026-06-01T09:00:00Z' },
    ];
    const original = [...photos];

    sortPhotosForTriage(photos);

    expect(photos).toEqual(original);
  });
});

describe('getModerationDecisionFromSwipe', () => {
  it('returns rejected for a leftward swipe past the threshold', () => {
    expect(getModerationDecisionFromSwipe(-60, 48)).toBe('rejected');
  });

  it('returns approved for a rightward swipe past the threshold', () => {
    expect(getModerationDecisionFromSwipe(60, 48)).toBe('approved');
  });

  it('returns null when the swipe is shorter than the threshold', () => {
    expect(getModerationDecisionFromSwipe(20, 48)).toBeNull();
    expect(getModerationDecisionFromSwipe(-20, 48)).toBeNull();
  });

  it('counts an offset equal to the threshold, but not just under it', () => {
    expect(getModerationDecisionFromSwipe(48, 48)).toBe('approved');
    expect(getModerationDecisionFromSwipe(47.9, 48)).toBeNull();
  });
});
