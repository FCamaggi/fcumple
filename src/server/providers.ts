import type { IdentityProvider } from './identifyHandler';

/**
 * Registro de proveedores de identidad para `rut_lookup`.
 *
 * Está VACÍO a propósito: ningún proveedor se ha contratado. Un proveedor se
 * agrega solo con contrato vigente (encargado de tratamiento de datos) y
 * devolviendo únicamente el nombre. El raspador de nombrerutyfirma.com fue
 * evaluado y descartado: docs/estrategia/evaluacion-rutificador-nombrerutyfirma.md.
 *
 * Se activa con la variable de entorno IDENTITY_PROVIDER=<clave del registro>.
 */
export const PROVIDERS: Record<string, (env: Record<string, string | undefined>) => IdentityProvider> = {};

export function createProviderFromEnv(env: Record<string, string | undefined>): IdentityProvider | null {
  const key = env.IDENTITY_PROVIDER;
  if (!key) return null;
  const factory = PROVIDERS[key];
  return factory ? factory(env) : null;
}
