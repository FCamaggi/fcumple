import { handleIdentify, type RpcResult } from '../src/server/identifyHandler';
import { createProviderFromEnv } from '../src/server/providers';

/**
 * POST /api/identify  { slug, rut }  ->  { outcome, guest_token?, guest_id?, guest_name? }
 *
 * Identificación por RUT con un proveedor externo. El RUT no se guarda ni se
 * registra (ver src/server/identifyHandler.ts). Sin IDENTITY_PROVIDER
 * configurado responde 501.
 *
 * Variables de entorno (servidor, nunca VITE_*): SUPABASE_URL,
 * SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, IDENTITY_PROVIDER.
 */

async function callRpc(fn: string, args: Record<string, unknown>, key: string): Promise<RpcResult> {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(args),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: { code: payload?.code, message: payload?.message } };
  }
  return { data: payload, error: null };
}

export async function POST(request: Request): Promise<Response> {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !anonKey || !serviceKey) {
    return Response.json({ error: 'server_not_configured' }, { status: 500 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const result = await handleIdentify(input, {
    provider: createProviderFromEnv(process.env),
    rpcPublic: (fn, args) => callRpc(fn, args, anonKey),
    rpcPrivileged: (fn, args) => callRpc(fn, args, serviceKey),
    clientKey: forwarded.split(',')[0].trim() || 'unknown',
  });

  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
