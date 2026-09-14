import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/photosApi', () => ({
  uploadPhoto: vi.fn(),
}));

import CameraCapture from './CameraCapture';
import type { CameraTrackCapabilities } from '../lib/cameraControls';

/**
 * What's covered here (same honesty criterion as QrScanner.test.tsx and
 * the original version of this file): the "what happens with an
 * already-captured blob" logic lives in usePhotoCapture
 * (src/hooks/usePhotoCapture.test.ts), and "what controls to show given a
 * capabilities object" lives in lib/cameraControls.test.ts (both fully
 * covered there, without simulating a real track). What's exercised below
 * about CameraCapture itself:
 *  1. the out-of-quota short-circuit (no camera opened, "Cerrar" still
 *     works) -- a pure prop-driven branch, no camera involved;
 *  2. the fallback message when `navigator.mediaDevices` doesn't exist,
 *     same as jsdom's default (no camera support);
 *  3. the close button always calling onClose;
 *  4. with a *mocked* getUserMedia/MediaStreamTrack (not a real camera --
 *     just a fake object shaped like one, same idea as mocking
 *     `uploadPhoto`), that the zoom slider / torch toggle only render when
 *     the mocked track reports that capability, and that interacting with
 *     them calls `track.applyConstraints` with the right value.
 *
 * NOT covered, and not realistically coverable in jsdom: actually opening
 * a device camera, drawing a live video frame to canvas, resizing/
 * compressing real pixels, or a user physically pressing the shutter on a
 * live feed. jsdom has no camera and no real `<video>`/`<canvas>` pixel
 * pipeline -- the mocked getUserMedia below never produces real video, it
 * only exercises the React wiring around a track's capabilities.
 */

function makeTrack(capabilities: CameraTrackCapabilities = {}) {
  return {
    stop: vi.fn(),
    getCapabilities: vi.fn(() => capabilities),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };
}

function mockCamera(track: ReturnType<typeof makeTrack>) {
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia },
  });
  return { getUserMedia, stream };
}

beforeEach(() => {
  // jsdom no implementa HTMLMediaElement.play() -- sin este stub, el
  // `await videoRef.current.play()` del componente rechaza con "Not
  // implemented" y el flujo cae al mensaje de error en vez de abrir la
  // cámara mockeada.
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CameraCapture', () => {
  it('does not open the camera and shows a clear message when the quota is already used up', () => {
    const onClose = vi.fn();
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 5 }} onClose={onClose} />);

    expect(screen.getByText(/se acabó tu rollo/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disparar/i })).not.toBeInTheDocument();
  });

  it('shows a clear message instead of a blank screen when the camera API is unavailable', async () => {
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    expect(await screen.findByText(/no permite acceder a la cámara/i)).toBeInTheDocument();
  });

  it('calls onClose when the close control is tapped, from the out-of-quota screen', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 5 }} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /cerrar/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close control is tapped, for the full-screen camera view', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={onClose} />);

    await screen.findByText(/no permite acceder a la cámara/i);
    await user.click(screen.getByRole('button', { name: /cerrar/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('renders the remaining shots via FilmRollCounter', async () => {
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    await screen.findByText(/no permite acceder a la cámara/i);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('disables the shoot button until the camera stream is actually ready', async () => {
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    // navigator.mediaDevices is undefined in jsdom by default, so this
    // component falls back to the camera-unavailable message -- the shoot
    // button stays rendered (so the layout doesn't jump) but disabled,
    // since there is no stream to capture a frame from.
    await screen.findByText(/no permite acceder a la cámara/i);
    expect(screen.getByRole('button', { name: /disparar/i })).toBeDisabled();
  });

  it('does not render zoom or torch controls when the mocked track reports neither capability', async () => {
    mockCamera(makeTrack({}));
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /disparar/i })).toBeEnabled());
    expect(screen.queryByLabelText(/zoom/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /flash/i })).not.toBeInTheDocument();
  });

  it('renders the zoom slider only when the mocked track reports a zoom capability, and applies constraints on change', async () => {
    const track = makeTrack({ zoom: { min: 1, max: 5, step: 0.5 } });
    mockCamera(track);
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    const slider = await screen.findByLabelText(/zoom/i);
    expect(screen.queryByRole('button', { name: /flash/i })).not.toBeInTheDocument();

    fireEventChange(slider, '2.5');

    await waitFor(() =>
      expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2.5 }] }),
    );
  });

  it('renders the torch toggle only when the mocked track reports a torch capability, and applies constraints on tap', async () => {
    const track = makeTrack({ torch: true });
    mockCamera(track);
    const user = userEvent.setup();
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    const toggle = await screen.findByRole('button', { name: /flash/i });
    expect(screen.queryByLabelText(/zoom/i)).not.toBeInTheDocument();

    await user.click(toggle);

    await waitFor(() => expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] }));
  });

  it('does not crash when the mocked track has no getCapabilities at all (Safari)', async () => {
    const stream = {
      getTracks: () => [{ stop: vi.fn() }],
      getVideoTracks: () => [{ stop: vi.fn() }],
    };
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /disparar/i })).toBeEnabled());
    expect(screen.queryByLabelText(/zoom/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /flash/i })).not.toBeInTheDocument();
  });
});

// React Testing Library's `userEvent` doesn't have a built-in "drag this
// range input to a value" helper -- firing the native change event
// directly is the documented way to move a controlled <input type="range">.
function fireEventChange(element: HTMLElement, value: string) {
  const input = element as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
