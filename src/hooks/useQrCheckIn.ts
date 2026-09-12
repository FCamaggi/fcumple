import { useCallback, useRef, useState } from 'react';
import { checkInGuest } from '../lib/adminApi';
import { extractTokenFromQrText } from '../lib/qrToken';
import type { Guest } from '../types';

export type QrCheckInState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'success'; guest: Guest; previousCheckedInAt: string | null }
  | { phase: 'error'; message: string };

/**
 * The check-in flow's non-DOM logic, split out from the camera loop so it's
 * testable without a real camera or a real QR decode (see
 * src/components/QrScanner.tsx): given a raw QR payload, resolves the token
 * (bare or full `/i/:token` link), calls check_in_guest, and tracks the
 * result as state the UI renders an overlay from.
 *
 * Debounce: while a scan is in flight or a result is on screen (any phase
 * other than 'idle'), `handleDetected` is a no-op -- a QR held steady in
 * front of the camera won't re-trigger on every frame. `reset()` (fired by
 * the admin's "Escanear otro") is what returns to 'idle' and re-arms it.
 *
 * `guests` is the admin's already-loaded guest list: it's how the hook
 * knows whether this guest had already checked in *before* this scan
 * (check_in_guest's own contract never overwrites an existing
 * checked_in_at and never errors on a re-scan, so the "already arrived"
 * distinction has to come from a snapshot taken before calling it).
 */
export function useQrCheckIn(guests: Guest[]) {
  const [state, setState] = useState<QrCheckInState>({ phase: 'idle' });
  const busyRef = useRef(false);

  const handleDetected = useCallback(
    (rawText: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setState({ phase: 'checking' });

      const token = extractTokenFromQrText(rawText);
      const existing = guests.find((g) => g.token === token);
      const previousCheckedInAt = existing?.checkedInAt ?? null;

      checkInGuest(token)
        .then((guest) => {
          setState({ phase: 'success', guest, previousCheckedInAt });
        })
        .catch((err: unknown) => {
          setState({
            phase: 'error',
            message: err instanceof Error ? err.message : 'No pudimos verificar este QR.',
          });
        });
    },
    [guests],
  );

  const reset = useCallback(() => {
    busyRef.current = false;
    setState({ phase: 'idle' });
  }, []);

  return { state, handleDetected, reset };
}
