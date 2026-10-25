import { listFrames, listStickers } from './cameraStudioApi';
import type { GuestFrame, GuestSticker } from './platformGuestApi';
import type { OrganizerEvent } from './organizerApi';

/**
 * Marcos y stickers que vería un invitado, leídos con la sesión de la organizadora. Es la contraparte de
 * `listCameraAssets` (que usa el token de un invitado) para la vista previa del panel: aplica los mismos filtros
 * que `list_event_camera_assets` -- interruptor global del evento y `enabled` de cada pieza -- y marca como
 * predeterminado el marco que el evento eligió, para que la cámara de ensayo arranque igual que la real.
 */
export async function listPreviewCameraAssets(
  event: Pick<OrganizerEvent, 'id' | 'framesEnabled' | 'stickersEnabled' | 'defaultFrameId'>,
): Promise<{ frames: GuestFrame[]; stickers: GuestSticker[] }> {
  const [frames, stickers] = await Promise.all([
    event.framesEnabled ? listFrames(event.id) : Promise.resolve([]),
    event.stickersEnabled ? listStickers(event.id) : Promise.resolve([]),
  ]);

  return {
    frames: frames
      .filter((f) => f.enabled)
      .map((f) => ({
        id: f.id,
        label: f.label,
        template: f.template,
        params: f.params,
        isDefault: f.id === event.defaultFrameId,
      })),
    stickers: stickers
      .filter((s) => s.enabled)
      .map((s) => ({ id: s.id, kind: s.kind, emoji: s.emoji, storagePath: s.storagePath })),
  };
}
