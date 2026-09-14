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
 * (src/hooks/usePhotoCapture.test.ts); "what controls to show given a
 * capabilities object" and the zoom presets formula live in
 * lib/cameraControls.test.ts; frame navigation and draw dispatch live in
 * lib/cameraFrames.test.ts (all fully covered there, without simulating a
 * real track or canvas). What's exercised below about CameraCapture
 * itself:
 *  1. the out-of-quota short-circuit (no camera opened, "Cerrar" still
 *     works) -- a pure prop-driven branch, no camera involved;
 *  2. the fallback message when `navigator.mediaDevices` doesn't exist,
 *     same as jsdom's default (no camera support);
 *  3. the close button always calling onClose;
 *  4. with a *mocked* getUserMedia/MediaStreamTrack (not a real camera --
 *     just a fake object shaped like one, same idea as mocking
 *     `uploadPhoto`), that the zoom chips / torch toggle only render when
 *     the mocked track reports that capability, and that interacting with
 *     them calls `track.applyConstraints` with the right value;
 *  5. that the accessible ‹/› frame buttons (the tap fallback to the
 *     swipe gesture, same criterion as FaderToggle's tap-target snap
 *     zones) cycle the frame label shown below the shutter.
 *
 * NOT covered, and not realistically coverable in jsdom: actually opening
 * a device camera, drawing a live video frame to canvas (mirrored or with
 * a frame baked in), resizing/compressing real pixels, or a user
 * physically pressing the shutter or swiping on a live feed. jsdom has no
 * camera and no real `<video>`/`<canvas>` pixel pipeline -- the mocked
 * getUserMedia below never produces real video, it only exercises the
 * React wiring around a track's capabilities. Framer Motion's pan gesture
 * (`onPanEnd`) also isn't simulated here for the same reason drag isn't in
 * FaderToggle.test.tsx -- only its accessible button fallback is tested.
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

  it('renders zoom preset chips only when the mocked track reports a zoom capability, and applies constraints when one is tapped', async () => {
    const track = makeTrack({ zoom: { min: 1, max: 5, step: 0.5 } });
    mockCamera(track);
    const user = userEvent.setup();
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    // getZoomPresets({ min: 1, max: 5 }) === [1, 3, 5] -- covered in
    // lib/cameraControls.test.ts, this only checks the chips are wired up.
    const midChip = await screen.findByRole('button', { name: '3.0x' });
    expect(screen.queryByRole('button', { name: /flash/i })).not.toBeInTheDocument();

    await user.click(midChip);

    await waitFor(() => expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 3 }] }));
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

  it('shows an icon button (not a text link) to flip between front and back camera', async () => {
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    await screen.findByText(/no permite acceder a la cámara/i);
    expect(screen.getByRole('button', { name: 'Cambiar cámara' })).toBeInTheDocument();
    expect(screen.queryByText('Cambiar cámara', { selector: 'a' })).not.toBeInTheDocument();
  });

  it('starts on "sin marco" and cycles frames via the accessible ‹/› fallback buttons, wrapping around', async () => {
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);
    const user = userEvent.setup();

    await screen.findByText(/no permite acceder a la cámara/i);
    expect(screen.getByText(/marco \/\/ sin marco/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    expect(screen.getByText(/marco \/\/ esquinas neón/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Marco anterior' }));
    expect(screen.getByText(/marco \/\/ sin marco/i)).toBeInTheDocument();

    // Wraps to the last frame going backwards from the start.
    await user.click(screen.getByRole('button', { name: 'Marco anterior' }));
    expect(screen.getByText(/marco \/\/ tipográfico/i)).toBeInTheDocument();
  });
});
