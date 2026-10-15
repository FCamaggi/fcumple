import { isValidRut, normalizeRut } from '../lib/rut';

/**
 * Lógica de `POST /api/identify` (identificación por RUT con un servicio
 * externo). Pura y con dependencias inyectadas para poder probarla sin red.
 *
 * REGLA: el RUT existe solo en memoria durante esta llamada. No se guarda, no
 * se escribe en logs, no se devuelve en la respuesta, no se envía a la base de
 * datos (que solo recibe el NOMBRE ya resuelto) y los errores no lo incluyen.
 */

export interface IdentityProvider {
  /** Nombre legal asociado al RUT, o `null` si el proveedor no lo conoce. */
  resolveName(rut: string): Promise<string | null>;
}

export interface IdentifyDeps {
  /** `null` cuando no hay proveedor configurado. */
  provider: IdentityProvider | null;
  /** Llamada pública (clave anónima) a una RPC. */
  rpcPublic: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  /** Llamada privilegiada (service_role) a una RPC. */
  rpcPrivileged: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  /** IP del cliente, para el presupuesto de consultas. */
  clientKey: string;
}

export interface RpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

export interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

interface EventRow {
  id: string;
  identifier: string;
}

interface IdentifyRow {
  outcome: string;
  guest_token: string | null;
  guest_id: string | null;
  guest_name: string | null;
}

function json(status: number, body: Record<string, unknown>): HandlerResponse {
  return { status, body };
}

export async function handleIdentify(input: unknown, deps: IdentifyDeps): Promise<HandlerResponse> {
  const payload = input as { slug?: unknown; rut?: unknown } | null;
  if (!payload || typeof payload.slug !== 'string' || typeof payload.rut !== 'string' || !payload.slug) {
    return json(400, { error: 'bad_request' });
  }

  if (!deps.provider) {
    return json(501, { error: 'rut_lookup_not_configured' });
  }

  const eventResult = await deps.rpcPublic('get_event_public', { p_slug: payload.slug });
  if (eventResult.error) {
    return json(502, { error: 'database_error' });
  }
  const event = (eventResult.data as EventRow[] | null)?.[0];
  if (!event) {
    return json(404, { error: 'event_not_found' });
  }
  if (event.identifier !== 'rut_lookup') {
    return json(409, { error: 'event_uses_name_identification' });
  }

  if (!isValidRut(payload.rut)) {
    return json(400, { error: 'invalid_rut' });
  }
  const rut = normalizeRut(payload.rut) as string;

  // El presupuesto se consume ANTES de llamar al proveedor (cada consulta
  // cuesta dinero), con la IP y el evento: nada del RUT llega a la base.
  const quota = await deps.rpcPrivileged('register_verified_lookup', {
    p_event_id: event.id,
    p_client_key: deps.clientKey,
  });
  if (quota.error) {
    return quota.error.code === '53400' ? json(429, { error: 'too_many_attempts' }) : json(502, { error: 'database_error' });
  }

  let name: string | null;
  try {
    name = await deps.provider.resolveName(rut);
  } catch {
    // Sin detalle: el mensaje original podría contener el RUT.
    return json(502, { error: 'provider_error' });
  }

  if (!name) {
    return json(200, { outcome: 'not_found' });
  }

  const identified = await deps.rpcPrivileged('identify_guest_verified', {
    p_event_id: event.id,
    p_verified_name: name,
  });
  if (identified.error) {
    return json(502, { error: 'database_error' });
  }

  const row = (identified.data as IdentifyRow[] | null)?.[0];
  if (!row) {
    return json(502, { error: 'database_error' });
  }

  return json(200, {
    outcome: row.outcome,
    guest_token: row.guest_token,
    guest_id: row.guest_id,
    guest_name: row.guest_name,
  });
}
