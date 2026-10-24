import { useState } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/photosApi', () => ({
  uploadPhoto: vi.fn(),
}));

import CameraCapture from './CameraCapture';
import { uploadPhoto } from '../lib/photosApi';
import type { Photo, PhotoQuota } from '../types';

/**
 * Pulido de la cámara (PR 2): el ritual del rollo (el dígito baja al disparar, el sello al
 * quedar en el rollo, la salida al acabarse), un solo acento, foco y avisos. Mismo criterio que
 * CameraCapture.test.tsx: la cámara, el lienzo y el video son simulados; lo que se prueba es el
 * cableado de React. El foco real en un teléfono y el lector de pantalla no se prueban aquí.
 */

function makeTrack(capabilities: Record<string, unknown> = {}) {
  return {
    stop: vi.fn(),
    getCapabilities: vi.fn(() => capabilities),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };
}

function mockCamera(track: ReturnType<typeof makeTrack>) {
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
}

function mockCanvasPipeline() {
  vi.spyOn(window.HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
  vi.spyOn(window.HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
  const ctx = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(window.HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['fake-jpeg'], { type: 'image/jpeg' }));
  });
}

/** El padre real guarda el cupo que la cámara le informa: sin esto la cuenta no avanza. */
function Harness({ initial, eventName }: { initial: PhotoQuota; eventName?: string }) {
  const [quota, setQuota] = useState(initial);
  return <CameraCapture token="tok123" quota={quota} onQuotaChange={setQuota} onClose={() => {}} eventName={eventName} />;
}

async function shoot(initial: PhotoQuota = { quota: 5, used: 2 }, eventName?: string) {
  mockCanvasPipeline();
  mockCamera(makeTrack());
  const user = userEvent.setup();
  render(<Harness initial={initial} eventName={eventName} />);
  const shutter = await screen.findByRole('button', { name: /disparar/i });
  await waitFor(() => expect(shutter).toBeEnabled());
  return { user, shutter };
}

beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:mock-photo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ritual del rollo', () => {
  it('el dígito baja al disparar y vuelve a subir con «Repetir» (no se gastó nada)', async () => {
    const { user } = await shoot({ quota: 5, used: 2 });
    expect(screen.getByRole('img', { name: '3 disparos restantes de 5' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await screen.findByRole('button', { name: /repetir/i });
    expect(screen.getByRole('img', { name: '2 disparos restantes de 5' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /repetir/i }));
    expect(screen.getByRole('img', { name: '3 disparos restantes de 5' })).toBeInTheDocument();
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('al enviar con éxito el dígito baja una sola vez y aparece el sello «Quedó en el rollo»', async () => {
    const { user } = await shoot({ quota: 5, used: 2 });
    vi.mocked(uploadPhoto).mockResolvedValue({ status: 'approved' } as Photo);

    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await user.click(await screen.findByRole('button', { name: /^enviar/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Quedó en el rollo');
    expect(screen.getByRole('img', { name: '2 disparos restantes de 5' })).toBeInTheDocument();
  });

  it('entre el éxito y el cierre de la revisión el dígito no baja una segunda vez (ni por un fotograma)', async () => {
    const { user } = await shoot({ quota: 5, used: 2 });
    vi.mocked(uploadPhoto).mockResolvedValue({ status: 'approved' } as Photo);
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) if (r.oldValue) seen.push(r.oldValue);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['aria-label'], attributeOldValue: true, subtree: true });

    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await user.click(await screen.findByRole('button', { name: /^enviar/i }));
    await screen.findByRole('status');
    observer.disconnect();

    expect(seen.filter((label) => label.includes('disparos restantes'))).not.toContain('1 disparos restantes de 5');
    expect(screen.getByRole('img', { name: '2 disparos restantes de 5' })).toBeInTheDocument();
  });

  it('la revisión aparece tras un retraso breve, para que se vea bajar el dígito antes de la foto', async () => {
    const { user } = await shoot({ quota: 5, used: 2 });
    await user.click(screen.getByRole('button', { name: /disparar/i }));

    // El diálogo ni siquiera existe todavía: un segundo toque en el obturador no puede caer en «Enviar».
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 disparos restantes de 5' })).toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: /revisión de la foto/i })).toBeInTheDocument();
  });

  it('con el sello de la foto anterior aún visible, la foto siguiente se puede enviar y reserva su dígito', async () => {
    const { user } = await shoot({ quota: 5, used: 2 });
    vi.mocked(uploadPhoto).mockResolvedValue({ status: 'approved' } as Photo);
    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await user.click(await screen.findByRole('button', { name: /^enviar/i }));
    expect(await screen.findByRole('status')).toBeInTheDocument();

    // Sin tocar «Ok»: se dispara otra vez.
    await user.click(await screen.findByRole('button', { name: /disparar/i }));
    expect(await screen.findByRole('button', { name: 'Enviar // te quedarán 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 disparos restantes de 5' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^enviar/i }));
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(2));
  });

  it('con un fallo de subida el dígito sigue reservado (la foto sigue en la revisión)', async () => {
    const { user } = await shoot({ quota: 5, used: 2 });
    vi.mocked(uploadPhoto).mockRejectedValueOnce(new Error('Sin red.'));

    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await user.click(await screen.findByRole('button', { name: /^enviar/i }));
    await screen.findByRole('alert');

    expect(screen.getByRole('img', { name: '2 disparos restantes de 5' })).toBeInTheDocument();
  });

  it('al enviar la última foto el sello se ve y la pantalla pasa a «se acabó el rollo» sin perder el aviso', async () => {
    const { user } = await shoot({ quota: 5, used: 4 });
    vi.mocked(uploadPhoto).mockResolvedValue({ status: 'approved' } as Photo);

    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await user.click(await screen.findByRole('button', { name: /^enviar/i }));

    expect(await screen.findByText(/se acabó tu rollo/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Quedó en el rollo');
    expect(screen.getByRole('img', { name: '0 disparos restantes de 5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cerrar/i })).toHaveFocus();
  });

  it('abrir la cámara con el rollo ya agotado no muestra ningún sello', () => {
    render(<Harness initial={{ quota: 5, used: 5 }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('foco y avisos', () => {
  it('la revisión es un diálogo modal con nombre y el foco entra en «Enviar»', async () => {
    const { user } = await shoot();
    await user.click(screen.getByRole('button', { name: /disparar/i }));

    const dialog = await screen.findByRole('dialog', { name: /revisión de la foto/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /^enviar/i })).toHaveFocus();
  });

  it('con la revisión abierta la cámara de atrás queda inerte, y Escape equivale a «Repetir»', async () => {
    const { user } = await shoot();
    const header = screen.getByRole('group', { name: /estado de la cámara/i }) as HTMLElement & { inert?: boolean };
    expect(header.inert).toBeFalsy();

    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await screen.findByRole('dialog', { name: /revisión de la foto/i });
    expect(header.inert).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(header.inert).toBe(false);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('mientras sube, «Enviar» no pierde el foco y un segundo toque no sube otra vez', async () => {
    const { user } = await shoot();
    vi.mocked(uploadPhoto).mockReturnValue(new Promise(() => undefined));
    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await user.click(await screen.findByRole('button', { name: /^enviar/i }));

    const sending = await screen.findByRole('button', { name: /enviando/i });
    expect(sending).toHaveFocus();
    expect(sending).toHaveAttribute('aria-disabled', 'true');

    await user.click(sending);
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
  });

  it('tras un fallo el foco queda en «Reintentar»', async () => {
    const { user } = await shoot();
    vi.mocked(uploadPhoto).mockRejectedValueOnce(new Error('Sin red.'));
    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await user.click(await screen.findByRole('button', { name: /^enviar/i }));

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toHaveFocus();
  });

  it('al cerrar la revisión con «Repetir» el foco vuelve al obturador', async () => {
    const { user, shutter } = await shoot();
    await user.click(shutter);
    await user.click(await screen.findByRole('button', { name: /repetir/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /disparar/i })).toHaveFocus());
  });

  it('al enviar con éxito el foco vuelve al obturador', async () => {
    const { user } = await shoot();
    vi.mocked(uploadPhoto).mockResolvedValue({ status: 'approved' } as Photo);
    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await user.click(await screen.findByRole('button', { name: /^enviar/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /disparar/i })).toHaveFocus());
  });

  it('el «Ok» del sello tiene área táctil de 44 px', async () => {
    const { user } = await shoot();
    vi.mocked(uploadPhoto).mockResolvedValue({ status: 'approved' } as Photo);
    await user.click(screen.getByRole('button', { name: /disparar/i }));
    await user.click(await screen.findByRole('button', { name: /^enviar/i }));

    expect(await screen.findByRole('button', { name: 'Ok' })).toHaveClass('tap-target');
  });

  it('el cambio de marco se anuncia en una región viva educada', async () => {
    const { user } = await shoot();
    const live = screen.getByText(/marco \/\/ sin marco/i);
    expect(live).toHaveAttribute('aria-live', 'polite');

    await user.click(screen.getByRole('button', { name: 'Siguiente marco' }));
    expect(live).toHaveTextContent(/marco \/\/ desechable/i);
  });
});

describe('boleto del evento', () => {
  it('muestra el nombre del evento junto al marco', async () => {
    await shoot({ quota: 5, used: 2 }, 'Fiesta de Fran');
    expect(screen.getByText('Fiesta de Fran')).toBeInTheDocument();
  });

  it('sin nombre de evento no pone ningún boleto vacío', async () => {
    await shoot();
    expect(screen.queryByTestId('boleto-evento')).not.toBeInTheDocument();
  });
});

describe('un solo acento', () => {
  it('el flash activo y el dígito no usan el acento ácido: queda el rosa de la cámara', async () => {
    mockCamera(makeTrack({ torch: true }));
    const user = userEvent.setup();
    render(<Harness initial={{ quota: 5, used: 2 }} />);

    const flash = await screen.findByRole('button', { name: /flash/i });
    await user.click(flash);

    expect(flash.className).not.toMatch(/acid/);
    expect(screen.getByText('3').className).not.toMatch(/acid/);
    expect(document.body.innerHTML).not.toMatch(/acid-400/);
  });
});
