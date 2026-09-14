/**
 * photoModerationQueue -- lógica pura del triage de fotos del admin (Etapa
 * 9, Frente 2 del backlog). Separada de PhotoModerationPanel.tsx por el
 * mismo motivo que cameraControls.ts/cameraFrames.ts en el Frente 1: es
 * testable sin cámara/Storage real, a diferencia del resto del componente
 * (fetch de `getSignedPhotoUrl`, el gesto de pan de framer-motion en sí).
 */

/** Cualquier registro con `createdAt` alcanza -- no necesita el tipo completo de ModerationPhoto. */
interface WithCreatedAt {
  createdAt: string;
}

// El triage drena la cola en el orden en que llegaron las fotos (más
// antigua primero) -- lo opuesto al orden descendente que usa
// `listAllPhotosForModeration` para otros usos (ese orden queda igual, este
// es específico de esta pantalla). `localeCompare` alcanza porque
// `created_at` viaja como ISO 8601, que ordena lexicográficamente igual que
// cronológicamente.
export function sortPhotosForTriage<T extends WithCreatedAt>(photos: T[]): T[] {
  return [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type ModerationDecision = 'approved' | 'rejected';

// Izquierda = rechazar, derecha = aprobar (mismo signo que
// getFrameIndexAfterSwipe en cameraFrames.ts: offset.x negativo es un
// swipe hacia la izquierda). Un arrastre más corto que el umbral no cuenta
// como intención real -- devuelve null y el llamador no hace nada.
export function getModerationDecisionFromSwipe(offsetX: number, threshold: number): ModerationDecision | null {
  if (Math.abs(offsetX) < threshold) return null;
  return offsetX < 0 ? 'rejected' : 'approved';
}
