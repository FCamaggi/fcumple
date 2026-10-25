import { describe, expect, it, vi } from 'vitest';
import { idealVideoConstraints, openCameraStream, streamMatchesOrientation } from './cameraStream';

function fakeStream(width?: number, height?: number) {
  const stop = vi.fn();
  const track = { stop, getSettings: () => (width ? { width, height } : {}) };
  return { stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream, stop };
}

describe('streamMatchesOrientation', () => {
  it('compara el lado largo con la orientación pedida', () => {
    expect(streamMatchesOrientation(fakeStream(1536, 2048).stream, 'portrait')).toBe(true);
    expect(streamMatchesOrientation(fakeStream(2048, 1536).stream, 'portrait')).toBe(false);
    expect(streamMatchesOrientation(fakeStream(2048, 1536).stream, 'landscape')).toBe(true);
  });

  it('da por bueno un video sin medidas o cuadrado', () => {
    expect(streamMatchesOrientation(fakeStream().stream, 'portrait')).toBe(true);
    expect(streamMatchesOrientation(fakeStream(800, 800).stream, 'landscape')).toBe(true);
  });
});

describe('openCameraStream', () => {
  it('usa el primer intento si llega con la orientación pedida', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream(1536, 2048).stream);
    const opened = await openCameraStream(getUserMedia, 'environment', 'portrait');
    expect(opened.attempt).toBe('ideal');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia.mock.calls[0][0]).toEqual({ video: idealVideoConstraints('environment', 'portrait') });
  });

  it('si Safari lo entrega girado, cierra ese flujo y pide las medidas giradas', async () => {
    const girado = fakeStream(2048, 1536);
    const derecho = fakeStream(1536, 2048);
    const getUserMedia = vi.fn().mockResolvedValueOnce(girado.stream).mockResolvedValueOnce(derecho.stream);
    const opened = await openCameraStream(getUserMedia, 'user', 'portrait');
    expect(opened).toMatchObject({ stream: derecho.stream, attempt: 'girado' });
    expect(girado.stop).toHaveBeenCalled();
    expect(derecho.stop).not.toHaveBeenCalled();
    expect(getUserMedia.mock.calls[1][0]).toEqual({ video: idealVideoConstraints('user', 'landscape') });
  });

  it('si ningún pedido con medidas calza, termina con la cámara sola', async () => {
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(fakeStream(2048, 1536).stream)
      .mockResolvedValueOnce(fakeStream(2048, 1536).stream)
      .mockResolvedValueOnce(fakeStream(480, 640).stream);
    const opened = await openCameraStream(getUserMedia, 'environment', 'portrait');
    expect(opened.attempt).toBe('basico');
    expect(getUserMedia.mock.calls[2][0]).toEqual({ video: { facingMode: 'environment' } });
  });

  it('el primer pedido puede forzarse (diagnóstico)', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream(480, 640).stream);
    await openCameraStream(getUserMedia, 'environment', 'portrait', { facingMode: 'environment' });
    expect(getUserMedia.mock.calls[0][0]).toEqual({ video: { facingMode: 'environment' } });
  });

  it('mide los cuadros reales cuando getSettings miente (iOS)', async () => {
    const mentiroso = fakeStream(1536, 2048); // dice vertical...
    const derecho = fakeStream(1536, 2048);
    const getUserMedia = vi.fn().mockResolvedValueOnce(mentiroso.stream).mockResolvedValueOnce(derecho.stream);
    const measure = vi
      .fn()
      .mockResolvedValueOnce({ w: 2048, h: 1536 }) // ...pero los cuadros llegan apaisados
      .mockResolvedValueOnce({ w: 1536, h: 2048 });
    const opened = await openCameraStream(getUserMedia, 'environment', 'portrait', null, measure);
    expect(opened.attempt).toBe('girado');
    expect(opened.log).toEqual(['ideal 2048×1536 ✗', 'girado 1536×2048 ✓']);
    expect(mentiroso.stop).toHaveBeenCalled();
  });
});
