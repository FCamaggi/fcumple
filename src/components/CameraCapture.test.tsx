import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/photosApi', () => ({
  uploadPhoto: vi.fn(),
}));

import CameraCapture from './CameraCapture';

/**
 * What's covered here (same honesty criterion as QrScanner.test.tsx):
 * the "what happens with an already-captured blob" logic lives in
 * usePhotoCapture (src/hooks/usePhotoCapture.test.ts, fully covered:
 * idle -> uploading -> success/error, quota bump, reset). Below, only two
 * things about CameraCapture itself are exercised:
 *  1. the out-of-quota short-circuit (no camera opened, no shoot button)
 *     -- a pure prop-driven branch, no camera involved;
 *  2. the fallback message when `navigator.mediaDevices` doesn't exist,
 *     same as jsdom's default (no camera support).
 *
 * NOT covered, and not realistically coverable in jsdom: actually opening
 * a device camera via getUserMedia, drawing a live video frame to canvas,
 * resizing/compressing real pixels, or a user physically pressing the
 * shutter on a live feed. jsdom has no camera and no real
 * `<video>`/`<canvas>` pixel pipeline.
 */
describe('CameraCapture', () => {
  it('does not open the camera and shows a clear message when the quota is already used up', () => {
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 5 }} />);

    expect(screen.getByText(/se acabó tu rollo/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disparar/i })).not.toBeInTheDocument();
  });

  it('shows a clear message instead of a blank screen when the camera API is unavailable', async () => {
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} />);

    expect(await screen.findByText(/no permite acceder a la cámara/i)).toBeInTheDocument();
  });

  it('renders the remaining shots via FilmRollCounter', () => {
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('disables the shoot button until the camera stream is actually ready', async () => {
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} />);

    // navigator.mediaDevices is undefined in jsdom by default, so this
    // component falls back to the camera-unavailable message -- the shoot
    // button stays rendered (so the layout doesn't jump) but disabled,
    // since there is no stream to capture a frame from.
    await screen.findByText(/no permite acceder a la cámara/i);
    expect(screen.getByRole('button', { name: /disparar/i })).toBeDisabled();
  });
});
