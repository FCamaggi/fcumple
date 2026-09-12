import { useCallback, useState } from 'react';
import { uploadPhoto } from '../lib/photosApi';
import type { PhotoQuota } from '../types';

export type PhotoCaptureState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'success' }
  | { phase: 'error'; message: string };

/**
 * usePhotoCapture -- la parte de CameraCapture que sí es testable sin una
 * cámara real (mismo criterio que useQrCheckIn para QrScanner): qué pasa
 * con un blob ya capturado. Sube la foto, actualiza el cupo en cuanto
 * `uploadPhoto` resuelve, y traduce cualquier falla (Storage o
 * submit_photo) en un mensaje legible en vez de dejar el estado colgado.
 */
export function usePhotoCapture(token: string, quota: PhotoQuota, onQuotaChange?: (quota: PhotoQuota) => void) {
  const [state, setState] = useState<PhotoCaptureState>({ phase: 'idle' });

  const capture = useCallback(
    async (blob: Blob) => {
      setState({ phase: 'uploading' });
      try {
        await uploadPhoto(token, blob);
        const next = { quota: quota.quota, used: quota.used + 1 };
        onQuotaChange?.(next);
        setState({ phase: 'success' });
      } catch (err) {
        setState({ phase: 'error', message: err instanceof Error ? err.message : 'No pudimos subir la foto.' });
      }
    },
    [token, quota, onQuotaChange],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, capture, reset };
}
