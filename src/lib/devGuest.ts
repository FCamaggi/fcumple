/**
 * @deprecated [Fase 0 - Decisión D10]
 * Este módulo pertenece al flujo de evento único e invitaciones individuales (/i/:token).
 * No se utiliza en el flujo multi-tenant (/e/:slug) y será eliminado en la poda post-fiesta.
 */
// Token fijo del invitado semilla de desarrollo (ver migración de
// supabase que crea la fila con is_dev = true). Cualquier lugar del código
// que necesite reconocer/tratar distinto a este invitado importa esta
// constante en vez de repetir el string.
export const DEV_GUEST_TOKEN = 'dev-preview';
