import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/photosApi', () => ({
  uploadPhoto: vi.fn(),
}));

import CameraCapture from './CameraCapture';
import { uploadPhoto } from '../lib/photosApi';
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
 *     `uploadPhoto`), that the torch toggle only renders when the mocked
 *     track reports that capability, and that interacting with it calls
 *     `track.applyConstraints` with the right value;
 *  5. that the accessible ‹/› frame buttons (the tap fallback to the
 *     swipe gesture, same criterion as FaderToggle's tap-target snap
 *     zones) cycle the frame label shown below the shutter;
 *  6. the review flow added in Etapa 11 (point 4): a mocked `canvas.toBlob`
 *     stands in for the real compositing pipeline (not testable in jsdom
 *     either, same reasons as below) to check that tapping the shutter
 *     shows the Repetir/Enviar screen instead of uploading straight away,
 *     that "Repetir" discards it and goes back to the live preview without
 *     ever calling `uploadPhoto`, and that "Enviar" is what actually
 *     triggers the upload with the captured blob.
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

/**
 * Deja el pipeline de <canvas> de handleShoot ejecutable en jsdom (que no
 * implementa un contexto 2D real): un <video> con dimensiones falsas para
 * pasar el guard de tamaño, un contexto 2D mockeado (mismo criterio que
 * cameraFrames.test.ts) y un toBlob síncrono con un Blob falso. El marco
 * arranca en "sin marco" (ver FRAME_IDS[0]), así que drawFrame no llama a
 * ningún método de dibujo real del contexto mockeado.
 */
function mockCanvasPipeline() {
  vi.spyOn(window.HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
  vi.spyOn(window.HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  };
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(window.HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['fake-jpeg'], { type: 'image/jpeg' }));
  });

  return ctx;
}

beforeEach(() => {
  // jsdom no implementa HTMLMediaElement.play() -- sin este stub, el
  // `await videoRef.current.play()` del componente rechaza con "Not
  // implemented" y el flujo cae al mensaje de error en vez de abrir la
  // cámara mockeada.
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

  // jsdom tampoco implementa URL.createObjectURL/revokeObjectURL (usadas
  // por la pantalla de revisión, Etapa 11). Asignación directa en vez de
  // vi.stubGlobal/vi.spyOn a propósito: React 18 difiere el cleanup de
  // efectos pasivos (el que llama a revokeObjectURL al desmontar) más allá
  // del afterEach síncrono de este archivo -- si el stub se deshace ahí
  // (unstubAllGlobals/restoreAllMocks), ese cleanup diferido explota contra
  // un URL ya restaurado. Una asignación real no la toca ninguno de los
  // dos, así que sobrevive a ese cleanup tardío sin falsos negativos.
  URL.createObjectURL = vi.fn(() => 'blob:mock-photo');
  URL.revokeObjectURL = vi.fn();
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

  it('does not render the torch toggle when the mocked track reports no torch capability', async () => {
    mockCamera(makeTrack({}));
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /disparar/i })).toBeEnabled());
    expect(screen.queryByRole('button', { name: /flash/i })).not.toBeInTheDocument();
  });

  it('renders the torch toggle only when the mocked track reports a torch capability, and applies constraints on tap', async () => {
    const track = makeTrack({ torch: true });
    mockCamera(track);
    const user = userEvent.setup();
    render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

    const toggle = await screen.findByRole('button', { name: /flash/i });

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
    expect(screen.getByText(/marco \/\/ desechable/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Marco anterior' }));
    expect(screen.getByText(/marco \/\/ sin marco/i)).toBeInTheDocument();

    // Wraps to the last frame going backwards from the start.
    await user.click(screen.getByRole('button', { name: 'Marco anterior' }));
    expect(screen.getByText(/marco \/\/ cinta fcumple/i)).toBeInTheDocument();
  });

  describe('review screen before sending (Etapa 11, punto 4)', () => {
    it('shows the Repetir/Enviar review screen on shoot, without uploading yet', async () => {
      mockCanvasPipeline();
      mockCamera(makeTrack({}));
      const user = userEvent.setup();
      render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

      const shutter = await screen.findByRole('button', { name: /disparar/i });
      await waitFor(() => expect(shutter).toBeEnabled());

      await user.click(shutter);

      expect(await screen.findByRole('button', { name: /repetir/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /enviar/i })).toBeInTheDocument();
      expect(screen.getByAltText(/foto recién sacada/i)).toBeInTheDocument();
      expect(uploadPhoto).not.toHaveBeenCalled();
    });

    it('discards the shot and returns to the live preview when "Repetir" is tapped, without uploading', async () => {
      mockCanvasPipeline();
      mockCamera(makeTrack({}));
      const user = userEvent.setup();
      render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

      const shutter = await screen.findByRole('button', { name: /disparar/i });
      await waitFor(() => expect(shutter).toBeEnabled());
      await user.click(shutter);

      await user.click(await screen.findByRole('button', { name: /repetir/i }));

      expect(screen.queryByRole('button', { name: /repetir/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
      await waitFor(() => expect(shutter).toBeEnabled());
      expect(uploadPhoto).not.toHaveBeenCalled();
    });

    it('uploads the captured blob only when "Enviar" is tapped', async () => {
      mockCanvasPipeline();
      mockCamera(makeTrack({}));
      const user = userEvent.setup();
      render(<CameraCapture token="tok123" quota={{ quota: 5, used: 2 }} onClose={() => {}} />);

      const shutter = await screen.findByRole('button', { name: /disparar/i });
      await waitFor(() => expect(shutter).toBeEnabled());
      await user.click(shutter);

      await user.click(await screen.findByRole('button', { name: /enviar/i }));

      await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
      const [, blobArg] = vi.mocked(uploadPhoto).mock.calls[0];
      expect(blobArg).toBeInstanceOf(Blob);
      expect(screen.queryByRole('button', { name: /repetir/i })).not.toBeInTheDocument();
    });
  });
});
