/**
 * Núcleo del servidor de fotos del PC del evento (T4 de odd/tasks/fotos-originales-pc.md).
 *
 * Es lo único del PC expuesto a internet (a través de cloudflared), así que solo lee:
 *   GET /health          200 si la carpeta de fotos se puede leer, 503 si no. La app lo usa para saber si el PC está.
 *   GET /p/<ruta>?exp&sig  entrega el original si la firma de photo_original_url es válida y no venció.
 *
 * Orden de las comprobaciones en /p/, de la más barata a la que toca el disco:
 *   1. la ruta cruda (sin decodificar ni normalizar) debe tener el formato de submit_photo; si no, 404;
 *   2. exactamente un `exp` y un `sig`, `exp` solo dígitos, firma HMAC-SHA256 en hex comparada en tiempo
 *      constante, sin vencer y no más de 2 horas en el futuro; si no, 403 (antes de mirar el disco, para no
 *      revelar qué archivos existen);
 *   3. el archivo real (resueltos los enlaces simbólicos) debe estar dentro de la carpeta y ser un archivo; si no, 404.
 * El texto firmado es "<ruta>\n<exp>", igual que en la migración 20261111100026_photo_originals_pc.sql.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { ORIGINAL_PATH_RE, localPathFor } from './archivar-core.mjs';

export const DEFAULT_PORT = 8787;
/** photo_original_url firma por 1 hora; se acepta hasta 2 por si el reloj del PC va atrasado. */
const MAX_AHEAD_S = 2 * 3600;
const EXP_RE = /^\d{1,12}$/;
const SIG_RE = /^[0-9a-f]{64}$/;
const ALLOW = 'GET, HEAD, OPTIONS';
const MIN_SECRET = 32;
const SEND_IDLE_MS = 30_000;

const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export class ServerConfigError extends Error {}

export function readServerConfig(env) {
  const fail = (message) => {
    throw new ServerConfigError(message);
  };
  const missing = ['FOTOS_SIGNING_SECRET', 'FOTOS_DIR'].filter((k) => !env[k]);
  if (missing.length > 0) fail(`faltan variables: ${missing.join(', ')}`);
  if (env.FOTOS_SIGNING_SECRET.length < MIN_SECRET) fail(`FOTOS_SIGNING_SECRET debe tener ${MIN_SECRET} caracteres o más`);

  const port = Number(env.FOTOS_PUERTO ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('FOTOS_PUERTO debe ser un entero entre 1 y 65535');

  // Siempre 127.0.0.1: sin el túnel no se llega al servidor ni desde la red de la casa.
  return { secret: env.FOTOS_SIGNING_SECRET, dir: env.FOTOS_DIR, host: '127.0.0.1', port };
}

/**
 * Comprueba la firma de un enlace de photo_original_url. `exp` y `sig` llegan como texto de la URL.
 * Devuelve 'ok', 'expired' (firma válida pero vencida) o 'bad'.
 */
export function verifySignature(storagePath, exp, sig, secret, nowS) {
  if (typeof exp !== 'string' || !EXP_RE.test(exp)) return 'bad';
  if (typeof sig !== 'string' || !SIG_RE.test(sig)) return 'bad';
  const expected = createHmac('sha256', secret).update(`${storagePath}\n${exp}`, 'utf8').digest();
  if (!timingSafeEqual(expected, Buffer.from(sig, 'hex'))) return 'bad';
  const expS = Number(exp);
  if (expS > nowS + MAX_AHEAD_S) return 'bad';
  if (expS < nowS) return 'expired';
  return 'ok';
}

const BASE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function send(res, status, body, extra = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...BASE_HEADERS,
    'Cache-Control': 'no-store',
    ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    'Content-Length': Buffer.byteLength(payload),
    ...extra,
  });
  res.end(res.req.method === 'HEAD' ? undefined : payload);
}

async function isReadableDir(dir) {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return false;
    await fs.access(dir, fs.constants.R_OK | fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Abre el original solo si, resueltos los enlaces, sigue dentro de `dir` y es un archivo. Si no, null. */
async function openInside(dir, storagePath) {
  let realRoot;
  let realTarget;
  try {
    realRoot = await fs.realpath(path.resolve(dir));
    realTarget = await fs.realpath(localPathFor(dir, storagePath));
  } catch {
    return null;
  }
  if (!realTarget.startsWith(realRoot + path.sep)) return null;
  let handle;
  try {
    handle = await fs.open(realTarget, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) {
      await handle.close();
      return null;
    }
    return { handle, size: stat.size };
  } catch {
    await handle?.close();
    return null;
  }
}

async function serveOriginal(req, res, { dir, secret, now }, storagePath, query) {
  if (!ORIGINAL_PATH_RE.test(storagePath)) return send(res, 404, { error: 'not_found' });

  const params = new URLSearchParams(query);
  const exps = params.getAll('exp');
  const sigs = params.getAll('sig');
  if (exps.length !== 1 || sigs.length !== 1) return send(res, 403, { error: 'forbidden' });
  const verdict = verifySignature(storagePath, exps[0], sigs[0], secret, now());
  if (verdict === 'expired') return send(res, 403, { error: 'expired' });
  if (verdict !== 'ok') return send(res, 403, { error: 'forbidden' });

  const file = await openInside(dir, storagePath);
  if (!file) return send(res, 404, { error: 'not_found' });

  const name = path.basename(storagePath);
  res.writeHead(200, {
    ...BASE_HEADERS,
    'Content-Type': CONTENT_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': file.size,
    // El nombre ya pasó ORIGINAL_PATH_RE: solo letras, dígitos, punto, guion y guion bajo.
    'Content-Disposition': `attachment; filename="${name}"`,
    // El enlace vence en 1 hora; que solo el navegador lo guarde, nunca un caché compartido.
    'Cache-Control': 'private, max-age=3600',
  });
  if (req.method === 'HEAD') {
    await file.handle.close();
    return res.end();
  }
  // pipeline (y no pipe) cierra el archivo también cuando el cliente corta la descarga a mitad de camino.
  // Un cliente que deja de leer por más de SEND_IDLE_MS pierde la conexión y el archivo se cierra.
  res.setTimeout(SEND_IDLE_MS, () => res.destroy());
  pipeline(file.handle.createReadStream(), res, () => {});
}

/** Manejador HTTP. `now` devuelve los segundos Unix actuales (se inyecta para probar el vencimiento). */
export function createHandler({ dir, secret, now = () => Math.floor(Date.now() / 1000), log = () => {} }) {
  return async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        return send(res, 204, undefined, {
          'Access-Control-Allow-Methods': ALLOW,
          'Access-Control-Max-Age': '86400',
        });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' }, { Allow: ALLOW });

      // La ruta se usa cruda: ni decodificada ni normalizada, para que `..` o `%2f` nunca pasen el formato.
      const url = req.url ?? '';
      const q = url.indexOf('?');
      const rawPath = q === -1 ? url : url.slice(0, q);
      const query = q === -1 ? '' : url.slice(q + 1);

      if (rawPath === '/health') {
        const ok = await isReadableDir(dir);
        return send(res, ok ? 200 : 503, { ok });
      }
      if (rawPath.startsWith('/p/')) {
        return await serveOriginal(req, res, { dir, secret, now }, rawPath.slice(3), query);
      }
      return send(res, 404, { error: 'not_found' });
    } catch (err) {
      log(`error en ${req.method}: ${err.message}`);
      if (res.headersSent) return res.destroy();
      return send(res, 500, { error: 'internal' });
    }
  };
}

export function createPhotoServer(options) {
  return http.createServer(createHandler(options));
}
