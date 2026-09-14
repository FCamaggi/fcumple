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

/**
 * Presets de zoom (Etapa 9, Frente 1) -- reemplazan el slider continuo por
 * tres chips: mínimo, medio y máximo del rango real que reportó el
 * dispositivo (`track.getCapabilities().zoom`). No son valores fijos tipo
 * "0.5x/1x/2x" a propósito: no siempre calzan con las lentes físicas reales
 * de cada dispositivo.
 *
 * Caso borde: si el rango no alcanza para al menos dos valores distintos
 * separados por `step` (`max - min < step`), tres chips mostrarían el mismo
 * número repetido -- se devuelve un único preset (el punto medio) en su
 * lugar. Con `step > 0` y `max - min >= step`, el punto medio siempre queda
 * estrictamente entre `min` y `max`, así que los tres valores son distintos
 * entre sí sin necesidad de deduplicar.
 */
export function getZoomPresets(range: ZoomRange): number[] {
  const { min, max, step } = range;
  const mid = min + (max - min) / 2;
  // `max - min <= 0` cubre min === max sin depender de step -- un
  // dispositivo puede reportar step: 0 explícito (no solo ausente) en ese
  // caso, y `max - min < step` da 0 < 0 = false, lo que devolvería
  // [min, mid, max] con los tres valores idénticos (keys de React
  // duplicadas en ZoomChips). Chequear el rango en sí, no solo contra
  // step, cierra ese caso sin cambiar el comportamiento normal.
  if (max - min <= 0 || max - min < step) return [mid];
  return [min, mid, max];
}
