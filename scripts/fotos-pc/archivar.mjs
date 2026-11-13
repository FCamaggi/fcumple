#!/usr/bin/env node

/**
 * Worker del PC del evento: archiva los originales de Storage en el disco local (T3 de
 * odd/tasks/fotos-originales-pc.md). Corre en el PC, nunca en Vercel ni en el navegador.
 *
 * Uso:
 *   npm run fotos:archivar -- [--una-vez] [--conservar-en-storage]
 *   (equivale a node --env-file=.env.fotos scripts/fotos-pc/archivar.mjs …; --env-file pide Node 20.6 o más)
 *
 * Variables (en un archivo fuera de git, con permisos solo para el dueño):
 *   SUPABASE_URL                 https://<proyecto>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    clave de servicio (lee y borra en Storage, marca la tabla photos)
 *   FOTOS_DIR                    carpeta donde se guardan los originales
 *   FOTOS_INTERVALO_S            segundos entre vueltas (15 por defecto)
 *   FOTOS_LOTE                   fotos por vuelta (20 por defecto)
 *
 * --una-vez                hace una sola vuelta y termina (para probar).
 * --conservar-en-storage   no borra el original de Storage después de archivarlo (respaldo doble, gasta cuota).
 */

import { createClient } from '@supabase/supabase-js';
import { archiveBatch } from './archivar-core.mjs';
import { ConfigError, readConfig, supabaseDeps } from './archivar-supabase.mjs';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

let config;
try {
  config = readConfig(process.argv.slice(2), process.env);
} catch (err) {
  if (err instanceof ConfigError) fail(err.message);
  throw err;
}
// Ninguna petición puede colgar al worker: a los 2 minutos se corta y la foto se reintenta.
const fetchWithTimeout = (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(120_000) });
const supabase = createClient(config.url, config.key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fetchWithTimeout },
});
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);
const deps = supabaseDeps(supabase, log);
const state = {};

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    log('deteniendo al terminar la foto en curso');
  });
}

log(`archivando en ${config.dir}${config.keepInStorage ? ' (conservando en Storage)' : ''}`);
do {
  try {
    const s = await archiveBatch(deps, {
      dir: config.dir,
      keepInStorage: config.keepInStorage,
      limit: config.limit,
      state,
    });
    if (s.archived + s.recovered + s.skipped + s.failed > 0) {
      log(`vuelta: ${s.archived} archivadas, ${s.recovered} recuperadas, ${s.skipped} sin archivo, ${s.failed} con error`);
    }
  } catch (err) {
    log(`vuelta fallida: ${err.message}`);
  }
  if (config.once || stopping) break;
  await new Promise((resolve) => setTimeout(resolve, config.intervalS * 1000));
} while (!stopping);
