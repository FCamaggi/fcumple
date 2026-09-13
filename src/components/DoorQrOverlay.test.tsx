import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// qrcode dibuja sobre un <canvas> real -- jsdom no tiene pipeline de canvas,
// mismo mock que ya usa DevPanel.test.tsx.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake') },
}));

import DoorQrOverlay from './DoorQrOverlay';

describe('DoorQrOverlay', () => {
  it('renders a real QR encoding the guest link once generated', async () => {
    render(<DoorQrOverlay token="mafe-8842" onClose={vi.fn()} />);

    const img = await screen.findByAltText(/tu código de acceso/i);
    expect(img).toHaveAttribute('src', 'data:image/png;base64,fake');
  });

  it('calls onClose exactly once when the close button is tapped', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DoorQrOverlay token="mafe-8842" onClose={onClose} />);
    await screen.findByAltText(/tu código de acceso/i);

    await user.click(screen.getByRole('button', { name: /cerrar/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('never closes on its own -- there is no backdrop dismiss', async () => {
    const onClose = vi.fn();
    render(<DoorQrOverlay token="mafe-8842" onClose={onClose} />);
    const dialog = await screen.findByRole('dialog');

    // Clicking anywhere on the overlay itself (not the button) must not
    // close it -- the button is the ONLY way out, on purpose: that's what
    // guarantees the caller's refresh-on-close always fires.
    await userEvent.setup().click(dialog);

    expect(onClose).not.toHaveBeenCalled();
  });
});
