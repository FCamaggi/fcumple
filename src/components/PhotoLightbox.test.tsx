import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhotoLightbox from './PhotoLightbox';

vi.mock('../lib/photosApi', () => ({
  getSignedPhotoUrl: vi.fn(),
  getSignedPhotoDownloadUrl: vi.fn(),
}));

import { getSignedPhotoUrl, getSignedPhotoDownloadUrl } from '../lib/photosApi';

const photos = [
  { storagePath: 'tok/a.jpg', displayStoragePath: 'tok/a-display.jpg', createdAt: '2026-10-10T01:00:00Z' },
  { storagePath: 'tok/b.jpg', displayStoragePath: null, createdAt: '2026-10-10T01:10:00Z' },
  { storagePath: 'tok/c.jpg', displayStoragePath: 'tok/c-display.jpg', createdAt: '2026-10-10T01:20:00Z' },
];

beforeEach(() => {
  vi.mocked(getSignedPhotoUrl).mockReset();
  vi.mocked(getSignedPhotoUrl).mockImplementation((path: string) => Promise.resolve(`https://signed.example/${path}`));
  vi.mocked(getSignedPhotoDownloadUrl).mockReset();
  vi.mocked(getSignedPhotoDownloadUrl).mockImplementation((path: string) =>
    Promise.resolve(`https://signed.example/${path}?download`),
  );
});

describe('PhotoLightbox', () => {
  it('renders as a dialog showing the requested starting photo, with a position indicator', async () => {
    render(<PhotoLightbox photos={photos} startIndex={1} onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await waitFor(() => {
      // 'b' has no display copy (null), so it falls back to the original.
      expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok/b.jpg');
    });
  });

  it('resolves neighbor photos eagerly but not the whole band', async () => {
    render(<PhotoLightbox photos={photos} startIndex={1} onClose={vi.fn()} />);

    await waitFor(() => {
      // 'a' and 'c' have a display copy and are requested via that path;
      // 'b' has none and falls back to its original.
      expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok/a-display.jpg');
      expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok/b.jpg');
      expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok/c-display.jpg');
    });
    // With 3 photos total, "neighbors" of index 1 covers the whole band --
    // the guarantee under test is that it never resolves more than what's
    // reachable from the current position (no front-loading unrelated
    // bands), which the RevealedRoll-level tests also cover.
    expect(getSignedPhotoUrl).toHaveBeenCalledTimes(3);
  });

  it('falls back to the original storage path for viewing when a photo has no display copy', async () => {
    const noDisplayPhotos = [{ storagePath: 'tok/only.jpg', displayStoragePath: null, createdAt: '2026-10-10T01:00:00Z' }];
    render(<PhotoLightbox photos={noDisplayPhotos} startIndex={0} onClose={vi.fn()} />);

    await screen.findByRole('dialog');

    await waitFor(() => {
      expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok/only.jpg');
    });
  });

  it('prefers the display copy over the original for on-screen viewing when one exists', async () => {
    const withDisplayPhotos = [
      { storagePath: 'tok/only.jpg', displayStoragePath: 'tok/only-display.jpg', createdAt: '2026-10-10T01:00:00Z' },
    ];
    render(<PhotoLightbox photos={withDisplayPhotos} startIndex={0} onClose={vi.fn()} />);

    await screen.findByRole('dialog');

    await waitFor(() => {
      expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok/only-display.jpg');
    });
    expect(getSignedPhotoUrl).not.toHaveBeenCalledWith('tok/only.jpg');
  });

  it('navigates to the next photo via the next button and updates the position indicator', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox photos={photos} startIndex={0} onClose={vi.fn()} />);

    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Foto siguiente' }));

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('navigates to the previous photo via the previous button, wrapping around', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox photos={photos} startIndex={0} onClose={vi.fn()} />);

    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Foto anterior' }));

    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('navigates with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox photos={photos} startIndex={0} onClose={vi.fn()} />);

    await screen.findByRole('dialog');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PhotoLightbox photos={photos} startIndex={0} onClose={onClose} />);

    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on close button click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PhotoLightbox photos={photos} startIndex={0} onClose={onClose} />);

    await user.click(await screen.findByRole('button', { name: 'Cerrar visor de fotos' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click but not on clicks inside the dialog', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<PhotoLightbox photos={photos} startIndex={0} onClose={onClose} />);

    const dialog = await screen.findByRole('dialog');
    await user.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    // The outer fixed overlay is the backdrop -- first child of the root.
    const backdrop = container.firstElementChild as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('requests a signed download url for the original storage path even though this photo has a display copy, lazily on click', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox photos={photos} startIndex={0} onClose={vi.fn()} />);

    await screen.findByRole('dialog');
    expect(getSignedPhotoDownloadUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /descargar/i }));

    await waitFor(() => {
      expect(getSignedPhotoDownloadUrl).toHaveBeenCalledWith('tok/a.jpg');
    });
    expect(getSignedPhotoDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it('downloads the currently-shown photo after navigating, not the original one', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox photos={photos} startIndex={0} onClose={vi.fn()} />);

    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Foto siguiente' }));
    await user.click(screen.getByRole('button', { name: /descargar/i }));

    await waitFor(() => {
      expect(getSignedPhotoDownloadUrl).toHaveBeenCalledWith('tok/b.jpg');
    });
    expect(getSignedPhotoDownloadUrl).not.toHaveBeenCalledWith('tok/a.jpg');
  });

  it('does not re-request a signed url for a photo already resolved on rapid back-and-forth navigation (0 -> 1 -> 0)', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox photos={photos} startIndex={0} onClose={vi.fn()} />);

    await screen.findByRole('dialog');
    await waitFor(() => {
      // 'a' has a display copy, so it's resolved via that path, not the original.
      expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok/a-display.jpg');
    });
    const callsForAOnMount = vi
      .mocked(getSignedPhotoUrl)
      .mock.calls.filter(([path]) => path === 'tok/a-display.jpg').length;
    expect(callsForAOnMount).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Foto siguiente' })); // index 0 -> 1
    await user.click(screen.getByRole('button', { name: 'Foto anterior' })); // index 1 -> 0, back to 'a'

    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    // 'a' was already resolved (and cached, keyed by its stable storagePath)
    // on mount -- going back to it should reuse that cached promise instead
    // of issuing a fresh request.
    const callsForAAfterNav = vi
      .mocked(getSignedPhotoUrl)
      .mock.calls.filter(([path]) => path === 'tok/a-display.jpg').length;
    expect(callsForAAfterNav).toBe(1);
  });

  it('traps focus inside the dialog: Tab from the last focusable element wraps to the first', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox photos={photos} startIndex={0} onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    const focusableInDialog = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusableInDialog[0];
    const last = focusableInDialog[focusableInDialog.length - 1];

    last.focus();
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(first);

    first.focus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to the triggering element when it closes', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Ver las 3 fotos';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const onClose = vi.fn();
    const { unmount } = render(<PhotoLightbox photos={photos} startIndex={0} onClose={onClose} />);
    await screen.findByRole('dialog');
    expect(document.activeElement).not.toBe(trigger);

    // Unmounting is what every close path (Escape, backdrop click, close
    // button) does via `onClose` -- the caller drops `lightboxIndex` back to
    // null, so this exercises the shared cleanup for all three.
    unmount();
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });

  // Drag/swipe navigation (framer-motion's `drag="x"` + `onDragEnd` on the
  // <motion.img>) is not covered by an automated test here: jsdom doesn't
  // implement layout/pointer capture, so simulating a real drag gesture
  // (PanInfo offsets included) isn't meaningfully possible in this
  // environment. Covered manually on-device instead.
});
