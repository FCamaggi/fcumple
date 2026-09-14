/**
 * cameraControls -- la parte de la cámara dedicada del invitado (Etapa 8
 * del backlog) que sí es testable sin un MediaStreamTrack real: dado un
 * objeto de capabilities, decide qué controles mostrar.
 *
 * `zoom`/`torch` no están en los tipos DOM estándar de TypeScript
 * (lib.dom.d.ts sólo los conoce en MediaTrackSettings, no en
 * MediaTrackCapabilities ni en MediaTrackConstraintSet) porque son
 * extensiones no estándar que hoy sólo implementan Chrome/Android de forma
 * consistente -- de ahí los tipos extendidos de acá. Safari ni siquiera
 * implementa `track.getCapabilities()`, por eso todo llamador de esto lee
 * el resultado detrás de optional chaining y nunca asume que existe.
 */

export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

export interface CameraTrackCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
}

export interface CameraTrackConstraintSet extends MediaTrackConstraintSet {
  zoom?: number;
  torch?: boolean;
}

export interface CameraControlsAvailability {
  zoom: ZoomRange | null;
  torch: boolean;
}

/**
 * Decisión pura de "qué control mostrar": un control sólo se renderiza
 * cuando el navegador reportó la capability correspondiente -- nunca un
 * control deshabilitado ni uno que falle en silencio al tocarlo.
 */
export function getCameraControlsAvailability(
  capabilities: CameraTrackCapabilities | null | undefined,
): CameraControlsAvailability {
  if (!capabilities) return { zoom: null, torch: false };

  const rawZoom = capabilities.zoom;
  const zoom =
    rawZoom && typeof rawZoom.min === 'number' && typeof rawZoom.max === 'number'
      ? { min: rawZoom.min, max: rawZoom.max, step: typeof rawZoom.step === 'number' ? rawZoom.step : 0.1 }
      : null;

  return { zoom, torch: capabilities.torch === true };
}
