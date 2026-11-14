import { createContext } from 'react';

/**
 * «Aparezco en esta foto»: lo provee `GuestHub` (el invitado identificado) y lo usa `PhotoLightbox`. Sin
 * proveedor (vista previa de la organizadora, hub de la Fase 0) el visor no ofrece el botón.
 */
export interface PhotoAppearance {
  /** Marca o desmarca la foto; rechaza con un mensaje legible si no se pudo guardar. */
  toggle: (storagePath: string, appears: boolean) => Promise<void>;
}

export const PhotoAppearanceContext = createContext<PhotoAppearance | null>(null);
