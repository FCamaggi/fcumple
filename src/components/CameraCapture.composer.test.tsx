import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installPointerEventPolyfill, mockElementSize } from '../test/pointerEvents';
import CameraCapture from './CameraCapture';
import type { CameraFrameOption, CameraStickerOption } from './camera/types';

vi.mock('../lib/photosApi', () => ({ uploadPhoto: vi.fn() }));

/**
 * Modo compositor de la cámara (Fase 1): marcos paramétricos y stickers del
 * evento. Igual que CameraCapture.test.tsx, la cámara real y los píxeles no se
 * pueden probar en jsdom; acá se prueba el cableado: carrusel de marcos,
 * bandeja de stickers y, sobre todo, el ORDEN de composición de la foto final
 * (foto → stickers → marco) con un contexto 2D que registra las llamadas.
 */

beforeAll(installPointerEventPolyfill);

const log: string[] = [];

function makeFrames(): CameraFrameOption[] {
  return [
    { id: 'f1', label: 'Borde', draw: vi.fn(() => log.push('marco:Borde')) },
    { id: 'f2', label: 'Título', draw: vi.fn(() => log.push('marco:Título')) },
  ];
}

const stickers: CameraStickerOption[] = [
  { id: 's1', label: '🎉', asset: { kind: 'emoji', emoji: '🎉' } },
  { id: 's2', label: '🎂', asset: { kind: 'emoji', emoji: '🎂' } },
];

function mockCamera() {
  const track = { stop: vi.fn(), getCapabilities: vi.fn(() => ({})), applyConstraints: vi.fn() };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
}

/** jsdom no tiene orientación: el default es «horizontal». El teléfono real del invitado está en vertical. */
function stubOrientation(orientation: 'portrait' | 'landscape') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('orientation: portrait') ? orientation === 'portrait' : query.includes('pointer: fine'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function mockCanvasPipeline(videoW = 600, videoH = 800) {
  vi.spyOn(window.HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(videoW);
  vi.spyOn(window.HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(videoH);
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(() => log.push('foto')),
    fillText: vi.fn(() => log.push('sticker')),
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(window.HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
    cb(new Blob(['fake'], { type: 'image/jpeg' }));
  });
  return ctx;
}

let restoreSize: () => void;

beforeEach(() => {
  log.length = 0;
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  // Contenedor de 400 × 600 y teléfono en vertical (3:4) → escenario de 400 × 533.
  restoreSize = mockElementSize(400, 600);
  stubOrientation('portrait');
});

afterEach(() => {
  restoreSize();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const quota = { quota: 5, used: 1 };

/** La bandeja de stickers está detrás de un botón de la cabecera: se abre antes de agregar. */
async function openStickers(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^stickers \d\/\d$/i }));
}

describe('CameraCapture: modo compositor', () => {
  it('arranca en "Sin marco" y recorre los marcos del evento con los botones ‹ ›, dando la vuelta', async () => {
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={stickers} />);
    const user = userEvent.setup();
    await screen.findByText(/no permite acceder a la cámara/i);

    expect(screen.getByText('Marco // Sin marco')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    expect(screen.getByText('Marco // Borde')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    expect(screen.getByText('Marco // Título')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    expect(screen.getByText('Marco // Sin marco')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marco anterior' }));
    expect(screen.getByText('Marco // Título')).toBeInTheDocument();
  });

  it('arranca en el marco por defecto del evento', async () => {
    render(
      <CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={[]} initialFrameId="f2" />,
    );
    await screen.findByText(/no permite acceder a la cámara/i);
    expect(screen.getByText('Marco // Título')).toBeInTheDocument();
  });

  it('un marco por defecto que ya no existe cae a "Sin marco"', async () => {
    render(
      <CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={[]} initialFrameId="borrado" />,
    );
    await screen.findByText(/no permite acceder a la cámara/i);
    expect(screen.getByText('Marco // Sin marco')).toBeInTheDocument();
  });

  it('sin stickers en el evento no muestra la bandeja ni el botón', async () => {
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={[]} />);
    await screen.findByText(/no permite acceder a la cámara/i);
    expect(screen.queryByRole('region', { name: 'Stickers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^stickers/i })).not.toBeInTheDocument();
  });

  it('la bandeja de stickers está cerrada hasta tocar «Stickers» y se vuelve a cerrar', async () => {
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={stickers} />);
    const user = userEvent.setup();
    const toggle = await screen.findByRole('button', { name: 'Stickers 0/5' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Agregar sticker 🎉' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Agregar sticker 🎉' })).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Agregar sticker 🎉' })).not.toBeInTheDocument();
  });

  it('el botón «Stickers» cuenta los de la foto aunque la bandeja esté cerrada, y no los pierde', async () => {
    mockCanvasPipeline();
    mockCamera();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={stickers} />);
    const user = userEvent.setup();

    await openStickers(user);
    await user.click(screen.getByRole('button', { name: 'Agregar sticker 🎉' }));
    await user.click(screen.getByRole('button', { name: 'Stickers 1/5' })); // cerrar

    expect(screen.getByRole('button', { name: 'Stickers 1/5' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Sticker 🎉/)).toBeInTheDocument(); // sigue en el visor
  });

  it('agrega stickers, los selecciona y permite agrandar, girar y quitar', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={stickers} />);

    await openStickers(user);
    await user.click(await screen.findByRole('button', { name: 'Agregar sticker 🎉' }));
    expect(screen.getByText('Stickers // 1/5')).toBeInTheDocument();

    const sticker = screen.getByLabelText('Sticker 🎉 (seleccionado)');
    expect(sticker).toHaveStyle({ width: '80px', height: '80px' }); // 0,2 × 400

    await user.click(screen.getByRole('button', { name: 'Más grande' }));
    expect(screen.getByLabelText('Sticker 🎉 (seleccionado)')).toHaveStyle({ width: '100px' });
    await user.click(screen.getByRole('button', { name: 'Más chico' }));
    await user.click(screen.getByRole('button', { name: 'Más chico' }));
    expect(screen.getByLabelText('Sticker 🎉 (seleccionado)')).toHaveStyle({ width: '64px' });

    await user.click(screen.getByRole('button', { name: 'Girar' }));
    expect(screen.getByLabelText('Sticker 🎉 (seleccionado)').style.transform).toMatch(/rotate\(0\.26/);

    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(screen.queryByLabelText(/^Sticker 🎉/)).not.toBeInTheDocument();
    expect(screen.getByText('Stickers // 0/5')).toBeInTheDocument();
  });

  it('el mismo sticker se puede agregar varias veces, hasta el máximo de 5 por foto', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={[]} stickers={stickers} />);

    await openStickers(user);
    const add = await screen.findByRole('button', { name: 'Agregar sticker 🎉' });
    for (let i = 0; i < 5; i++) await user.click(add);

    expect(screen.getByText('Stickers // 5/5')).toBeInTheDocument();
    expect(add).toBeDisabled();
    expect(document.querySelectorAll('[data-sticker-uid]')).toHaveLength(5);
  });

  it('compone la foto final en orden: foto → stickers → marco (el marco queda encima)', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    const frames = makeFrames();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={frames} stickers={stickers} />);

    await openStickers(user);
    await user.click(await screen.findByRole('button', { name: 'Agregar sticker 🎉' }));
    await user.click(screen.getByRole('button', { name: 'Agregar sticker 🎂' }));
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' })); // Borde

    log.length = 0; // solo interesa lo que pasa al disparar
    const shutter = screen.getByRole('button', { name: /disparar/i });
    await waitFor(() => expect(shutter).toBeEnabled());
    await user.click(shutter);
    await screen.findByRole('button', { name: /enviar/i });

    // La primera 'foto' es el video; el borde también se pinta en el preview del escenario,
    // por eso se mira solo el tramo de la captura (desde el drawImage del video).
    // Después viene un 'foto' más: la copia liviana "display", que se dibuja a partir
    // del canvas ya compuesto (ver handleShoot).
    const capture = log.slice(log.indexOf('foto'));
    expect(capture.slice(0, 4)).toEqual(['foto', 'sticker', 'sticker', 'marco:Borde']);
    expect(capture.slice(4)).toEqual(['foto']);

    const [, w, h] = (frames[0].draw as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect([w, h]).toEqual([600, 800]); // se dibuja a la resolución de la foto, no del preview
  });

  it('"Sin marco" no dibuja ningún marco sobre la foto', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    const frames = makeFrames();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={frames} stickers={[]} />);

    const shutter = await screen.findByRole('button', { name: /disparar/i });
    await waitFor(() => expect(shutter).toBeEnabled());
    await user.click(shutter);
    await screen.findByRole('button', { name: /enviar/i });

    expect(frames[0].draw).not.toHaveBeenCalled();
    expect(frames[1].draw).not.toHaveBeenCalled();
  });

  it('al enviar la foto se suben los blobs y la próxima parte sin stickers; "Repetir" los conserva', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    const upload = vi.fn().mockResolvedValue({
      id: 'p1', guestId: 'g1', storagePath: 'a', displayStoragePath: null, status: 'approved', createdAt: '2026-10-15T00:00:00Z',
    });
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={[]} stickers={stickers} upload={upload} />);

    await openStickers(user);
    await user.click(await screen.findByRole('button', { name: 'Agregar sticker 🎉' }));
    const shutter = screen.getByRole('button', { name: /disparar/i });
    await waitFor(() => expect(shutter).toBeEnabled());

    await user.click(shutter);
    await user.click(await screen.findByRole('button', { name: /repetir/i }));
    expect(screen.getByText('Stickers // 1/5')).toBeInTheDocument(); // repetir conserva los stickers

    await user.click(shutter);
    await user.click(await screen.findByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(screen.getByText('Stickers // 0/5')).toBeInTheDocument();
  });

  it('en modo compositor no se muestran la guía de encuadre ni el marco PNG de la Fase 0', async () => {
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={stickers} />);
    await screen.findByText(/no permite acceder a la cámara/i);
    expect(document.querySelector('img[src^="/marcos/"]')).toBeNull();
  });
});

describe('CameraCapture: encuadre fijo, sin importar el video del teléfono', () => {
  const stageSize = () => {
    const stage = screen.getByTestId('composer-stage');
    return { w: parseFloat(stage.style.width), h: parseFloat(stage.style.height) };
  };

  it('el visor es 3:4 en vertical y no salta cuando el video llega con otra proporción', async () => {
    mockCanvasPipeline(1080, 1920); // un teléfono que entrega 9:16
    mockCamera();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={stickers} />);
    const antes = stageSize();
    expect(antes.w / antes.h).toBeCloseTo(3 / 4, 2);

    const video = document.querySelector('video') as HTMLVideoElement;
    video.dispatchEvent(new Event('loadedmetadata'));
    await screen.findByRole('button', { name: /disparar/i });
    expect(stageSize()).toEqual(antes);
  });

  it('el visor es 4:3 con el teléfono acostado', async () => {
    stubOrientation('landscape');
    mockCanvasPipeline(640, 480);
    mockCamera();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={stickers} />);
    const { w, h } = stageSize();
    expect(w / h).toBeCloseTo(4 / 3, 2);
  });

  it('un video 9:16 se recorta al centro a 3:4 al disparar, y el marco se dibuja a ese tamaño', async () => {
    const ctx = mockCanvasPipeline(1080, 1920);
    mockCamera();
    const user = userEvent.setup();
    const frames = makeFrames();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={frames} stickers={stickers} />);
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));

    const shutter = screen.getByRole('button', { name: /disparar/i });
    await waitFor(() => expect(shutter).toBeEnabled());
    await user.click(shutter);
    await screen.findByRole('button', { name: /enviar/i });

    // drawImage(video, sx, sy, sw, sh, 0, 0, w, h): sale 1080 × 1440, con 240 px recortados arriba y abajo.
    const video = ctx.drawImage.mock.calls.find((c) => (c as unknown[])[0] instanceof HTMLVideoElement) as unknown[];
    expect(video.slice(1, 5)).toEqual([0, 240, 1080, 1440]);
    const [, w, h] = (frames[0].draw as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(w / h).toBeCloseTo(3 / 4, 3);
  });

  it('un video apaisado con el teléfono en vertical también sale 3:4 (se recortan los costados)', async () => {
    const ctx = mockCanvasPipeline(640, 480);
    mockCamera();
    const user = userEvent.setup();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={stickers} />);

    const shutter = await screen.findByRole('button', { name: /disparar/i });
    await waitFor(() => expect(shutter).toBeEnabled());
    await user.click(shutter);
    await screen.findByRole('button', { name: /enviar/i });

    const video = ctx.drawImage.mock.calls.find((c) => (c as unknown[])[0] instanceof HTMLVideoElement) as unknown[];
    expect(video.slice(1, 5)).toEqual([140, 0, 360, 480]);
  });

  // Cada marco declara en qué proporciones tiene diseño; `undefined` = en todas.
  const framesConProporcion = (): CameraFrameOption[] => [
    { id: 'v', label: 'Vertical', draw: vi.fn(), ratios: ['3:4', '1:1'] },
    { id: 'h', label: 'Horizontal', draw: vi.fn(), ratios: ['4:3'] },
    { id: 'a', label: 'Alto', draw: vi.fn(), ratios: ['9:16', '1:1'] },
    { id: 'l', label: 'Capas', draw: vi.fn() },
  ];

  const recorrer = async (user: ReturnType<typeof userEvent.setup>) => {
    const vistos: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const rotulo = screen.getByText(/^Marco \/\//).textContent ?? '';
      if (vistos.includes(rotulo)) break;
      vistos.push(rotulo);
      await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    }
    return vistos.map((r) => r.replace('Marco // ', ''));
  };

  const ratioButton = (ratio: string) => screen.getByRole('button', { name: `Proporción ${ratio}` });

  it('en vertical ofrece 3:4 (elegida), 1:1 y 9:16, y no 4:3', async () => {
    mockCanvasPipeline();
    mockCamera();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={framesConProporcion()} stickers={[]} />);
    const group = screen.getByRole('group', { name: 'Proporción de la foto' });
    expect(group).toBeInTheDocument();
    expect(ratioButton('3:4')).toHaveAttribute('aria-pressed', 'true');
    expect(ratioButton('1:1')).toHaveAttribute('aria-pressed', 'false');
    expect(ratioButton('9:16')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proporción 4:3' })).not.toBeInTheDocument();
  });

  it('con el teléfono acostado ofrece solo 4:3 (elegida) y 1:1', async () => {
    stubOrientation('landscape');
    mockCanvasPipeline(640, 480);
    mockCamera();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={framesConProporcion()} stickers={[]} />);
    expect(ratioButton('4:3')).toHaveAttribute('aria-pressed', 'true');
    expect(ratioButton('1:1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proporción 9:16' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proporción 3:4' })).not.toBeInTheDocument();
  });

  it('un marco sin diseño para la proporción elegida se oculta del carrusel', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={framesConProporcion()} stickers={[]} />);
    expect(await recorrer(user)).toEqual(['Sin marco', 'Vertical', 'Capas']); // 3:4

    await user.click(ratioButton('1:1'));
    expect(await recorrer(user)).toEqual(['Sin marco', 'Vertical', 'Alto', 'Capas']);

    await user.click(ratioButton('9:16'));
    expect(await recorrer(user)).toEqual(['Sin marco', 'Alto', 'Capas']);
  });

  it('acostado el carrusel muestra los marcos que tienen 4:3 y, en 1:1, los que tienen cuadrado', async () => {
    stubOrientation('landscape');
    mockCanvasPipeline(640, 480);
    mockCamera();
    const user = userEvent.setup();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={framesConProporcion()} stickers={[]} />);
    expect(await recorrer(user)).toEqual(['Sin marco', 'Horizontal', 'Capas']);
    await user.click(ratioButton('1:1'));
    expect(await recorrer(user)).toEqual(['Sin marco', 'Vertical', 'Alto', 'Capas']);
  });

  it('al cambiar de proporción el visor toma exactamente esa forma, sin tocar la cámara', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={framesConProporcion()} stickers={[]} />);
    const abierta = vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls.length;

    await user.click(ratioButton('1:1'));
    let { w, h } = stageSize();
    expect(w / h).toBeCloseTo(1, 2);
    await user.click(ratioButton('9:16'));
    ({ w, h } = stageSize());
    expect(w / h).toBeCloseTo(9 / 16, 2);
    await user.click(ratioButton('3:4'));
    ({ w, h } = stageSize());
    expect(w / h).toBeCloseTo(3 / 4, 2);

    expect(vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls.length).toBe(abierta); // no se reabrió
  });

  it('dispara con la proporción elegida: recorta el video a esa forma y dibuja el marco con ella', async () => {
    const ctx = mockCanvasPipeline(600, 800);
    mockCamera();
    const user = userEvent.setup();
    const frames = framesConProporcion();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={frames} stickers={[]} />);
    await user.click(ratioButton('1:1'));
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' })); // Vertical (tiene 1:1)

    const shutter = screen.getByRole('button', { name: /disparar/i });
    await waitFor(() => expect(shutter).toBeEnabled());
    await user.click(shutter);
    await screen.findByRole('button', { name: /enviar/i });

    const video = ctx.drawImage.mock.calls.find((c) => (c as unknown[])[0] instanceof HTMLVideoElement) as unknown[];
    expect(video.slice(1, 5)).toEqual([0, 100, 600, 600]); // cuadrado centrado: se pierden 100 px arriba y abajo
    const [, w, h, ratio] = (frames[0].draw as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(w).toBe(h);
    expect(ratio).toBe('1:1');
  });

  it('9:16 recorta los costados de un video 3:4', async () => {
    const ctx = mockCanvasPipeline(600, 800);
    mockCamera();
    const user = userEvent.setup();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={framesConProporcion()} stickers={[]} />);
    await user.click(ratioButton('9:16'));

    const shutter = screen.getByRole('button', { name: /disparar/i });
    await waitFor(() => expect(shutter).toBeEnabled());
    await user.click(shutter);
    await screen.findByRole('button', { name: /enviar/i });

    const video = ctx.drawImage.mock.calls.find((c) => (c as unknown[])[0] instanceof HTMLVideoElement) as unknown[];
    expect(video.slice(1, 5)).toEqual([75, 0, 450, 800]);
  });

  it('al cambiar de proporción vuelve al marco por defecto en vez de caer en otro por posición', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={framesConProporcion()} stickers={[]} />);
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    expect(screen.getByText('Marco // Vertical')).toBeInTheDocument();
    await user.click(ratioButton('9:16'));
    expect(screen.getByText('Marco // Sin marco')).toBeInTheDocument();
  });

  it('pide cargar los recursos de la proporción cuando se elige', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    const ensure = vi.fn().mockResolvedValue(undefined);
    const frames: CameraFrameOption[] = [{ id: 'v', label: 'Vertical', draw: vi.fn(), ratios: ['3:4', '1:1'], ensure }];
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={frames} stickers={[]} />);
    await waitFor(() => expect(ensure).toHaveBeenCalledWith('3:4'));
    await user.click(ratioButton('1:1'));
    await waitFor(() => expect(ensure).toHaveBeenCalledWith('1:1'));
  });

  /** Un marco cuyos recursos de 1:1 tardan en cargar hasta que el test los libere. */
  function marcoConCargaLenta() {
    let liberar: () => void = () => undefined;
    const puerta = new Promise<void>((resolve) => (liberar = resolve));
    const draw = vi.fn();
    const ensure = vi.fn((r: string) => (r === '1:1' ? puerta : Promise.resolve()));
    const frame: CameraFrameOption = { id: 'v', label: 'Vertical', draw, ratios: ['3:4', '1:1'], ensure };
    return { frame, draw, liberar };
  }

  it('redibuja el marco del visor cuando terminan de cargar los recursos de la proporción', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    const { frame, draw, liberar } = marcoConCargaLenta();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={[frame]} stickers={[]} />);
    await user.click(ratioButton('1:1'));
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    const antes = draw.mock.calls.length;

    liberar();
    await waitFor(() => expect(draw.mock.calls.length).toBeGreaterThan(antes));
    expect(draw.mock.calls.at(-1)![3]).toBe('1:1');
  });

  it('no deja disparar con un marco elegido mientras cargan sus recursos, pero sí sin marco', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    const { frame, liberar } = marcoConCargaLenta();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={[frame]} stickers={[]} />);
    const shutter = await screen.findByRole('button', { name: /disparar/i });
    await waitFor(() => expect(shutter).toBeEnabled());

    await user.click(ratioButton('1:1'));
    expect(shutter).toBeEnabled(); // «Sin marco»: no hay nada que esperar
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' })); // Vertical, aún cargando
    expect(shutter).toBeDisabled();

    liberar();
    await waitFor(() => expect(shutter).toBeEnabled());
  });

  it('el obturador espera solo al marco elegido, no a los demás marcos de la proporción', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    let liberar: () => void = () => undefined;
    const puerta = new Promise<void>((resolve) => (liberar = resolve));
    const frames: CameraFrameOption[] = [
      { id: 'rapido', label: 'Rápido', draw: vi.fn(), ratios: ['3:4', '1:1'], ensure: vi.fn(async () => undefined) },
      { id: 'lento', label: 'Lento', draw: vi.fn(), ratios: ['3:4', '1:1'], ensure: vi.fn((r: string) => (r === '1:1' ? puerta : Promise.resolve())) },
    ];
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={frames} stickers={[]} />);
    const shutter = await screen.findByRole('button', { name: /disparar/i });
    await waitFor(() => expect(shutter).toBeEnabled());

    await user.click(ratioButton('1:1'));
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' })); // Rápido
    await waitFor(() => expect(shutter).toBeEnabled()); // no espera a «Lento»
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' })); // Lento
    expect(shutter).toBeDisabled();
    liberar();
    await waitFor(() => expect(shutter).toBeEnabled());
  });

  it('volver a una proporción ya cargada no la vuelve a cargar ni bloquea el obturador', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    const { frame, liberar } = marcoConCargaLenta();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={[frame]} stickers={[]} />);
    const shutter = await screen.findByRole('button', { name: /disparar/i });
    await user.click(ratioButton('1:1'));
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    liberar();
    await waitFor(() => expect(shutter).toBeEnabled());

    await user.click(ratioButton('3:4'));
    await user.click(ratioButton('1:1'));
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    expect(shutter).toBeEnabled(); // sin pasar por «cargando»
    expect(screen.queryByText('Cargando marco…')).not.toBeInTheDocument();
    expect(vi.mocked(frame.ensure!).mock.calls.filter(([r]) => r === '1:1')).toHaveLength(1);
  });

  it('si los recursos de un marco no responden, el obturador se libera tras una espera máxima', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockCanvasPipeline();
      mockCamera();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const colgado: CameraFrameOption = {
        id: 'v',
        label: 'Vertical',
        draw: vi.fn(),
        ratios: ['3:4', '1:1'],
        ensure: vi.fn((r: string) => (r === '1:1' ? new Promise<void>(() => undefined) : Promise.resolve())),
      };
      render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={[colgado]} stickers={[]} />);
      const shutter = await screen.findByRole('button', { name: /disparar/i });
      await waitFor(() => expect(shutter).toBeEnabled());
      await user.click(ratioButton('1:1'));
      await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
      expect(shutter).toBeDisabled();

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      await waitFor(() => expect(shutter).toBeEnabled());
    } finally {
      vi.useRealTimers();
    }
  });

  it('el aviso «Cargando marco…» se anuncia a los lectores de pantalla', async () => {
    mockCanvasPipeline();
    mockCamera();
    const user = userEvent.setup();
    const { frame } = marcoConCargaLenta();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} frames={[frame]} stickers={[]} />);
    await user.click(ratioButton('1:1'));
    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    expect(screen.getByText('Cargando marco…').closest('[role="status"]')).not.toBeNull();
  });

  it('la cámara heredada (sin marcos ni stickers) no muestra selector de proporción', async () => {
    mockCanvasPipeline();
    mockCamera();
    render(<CameraCapture token="tok" quota={quota} onClose={() => {}} />);
    await screen.findByRole('button', { name: /disparar/i });
    expect(screen.queryByRole('group', { name: 'Proporción de la foto' })).not.toBeInTheDocument();
  });

  it('mientras la cámara está abierta la página de atrás no se desplaza, y se libera al cerrarla', () => {
    const { unmount } = render(
      <CameraCapture token="tok" quota={quota} onClose={() => {}} frames={makeFrames()} stickers={stickers} />,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
