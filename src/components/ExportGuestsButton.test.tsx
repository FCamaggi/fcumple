import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportGuestsButton from './ExportGuestsButton';
import { guestsToCsv } from '../lib/csv';
import type { Guest } from '../types';

const guests: Guest[] = [
  {
    id: 'g1',
    fullName: 'Ana Torres',
    status: 'confirmed',
    plusOnesAllowed: 1,
    plusOnesConfirmed: 1,
    guestNote: null,
    respondedAt: null,
    checkedInAt: null,
  },
];

describe('ExportGuestsButton', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    // jsdom doesn't implement these
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a Blob with the expected CSV content on click', () => {
    const capturedParts: BlobPart[][] = [];
    const OriginalBlob = Blob;
    vi.stubGlobal(
      'Blob',
      class extends OriginalBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          capturedParts.push(parts);
        }
      }
    );

    render(<ExportGuestsButton guests={guests} />);
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(capturedParts).toHaveLength(1);
    expect(capturedParts[0].join('')).toBe(guestsToCsv(guests));
  });
});
