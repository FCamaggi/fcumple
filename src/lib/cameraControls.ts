/**
 * cameraControls -- la parte de la cámara dedicada del invitado (Etapa 8
 * del backlog) que sí es testable sin un MediaStreamTrack real: dado un
 * objeto de capabilities, decide qué controles mostrar.
 *
 * `torch` no está en los tipos DOM estándar de TypeScript (lib.dom.d.ts
 * sólo lo conoce en MediaTrackSettings, no en MediaTrackCapabilities ni en
 * MediaTrackConstraintSet) porque es una extensión no estándar que hoy sólo
 * implementan Chrome/Android de forma consistente -- de ahí los tipos
 * extendidos de acá. Safari ni siquiera implementa `track.getCapabilities()`,
 * por eso todo llamador de esto lee el resultado detrás de optional
 * chaining y nunca asume que existe.
 *
 * El control de zoom que existió en la Etapa 9 se sacó por completo en la
 * Etapa 11: el rango que reporta la API de cámara del navegador es zoom
 * digital de la lente activa, no una selección de lentes físicas
 * (ultra gran angular/normal/óptico) como pedía el usuario, y la mayoría de
 * los dispositivos ni siquiera reporta un mínimo por debajo de 1x -- ver
 * docs/04-producto/BACKLOG.md, Etapa 11, punto 3.
 */

export interface CameraTrackCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
}

export interface CameraTrackConstraintSet extends MediaTrackConstraintSet {
  zoom?: number;
  torch?: boolean;
}

export interface CameraControlsAvailability {
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
  if (!capabilities) return { torch: false };

  return { torch: capabilities.torch === true };
}
