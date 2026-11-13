#!/usr/bin/env node

/**
 * Servidor de fotos del PC del evento (T4 de odd/tasks/fotos-originales-pc.md). Entrega los originales que
 * archivó el worker (archivar.mjs) a quien traiga un enlace firmado por photo_original_url. Escucha solo en
 * 127.0.0.1; cloudflared lo publica en https://fotos.<dominio>.
 *
 * Uso:
 *   npm run fotos:servir
 *   (equivale a node --env-file=.env.fotos scripts/fotos-pc/servir.mjs; --env-file pide Node 20.6 o más)
 *
 * Variables (en un archivo fuera de git, con permisos solo para el dueño):
 *   FOTOS_SIGNING_SECRET   el mismo secreto de private.photo_archive en Supabase (32 caracteres o más)
 *   FOTOS_DIR              la carpeta donde el worker guarda los originales
 *   FOTOS_PUERTO           puerto local (8787 por defecto; el de config.yml de cloudflared)
 */

import { ServerConfigError, createPhotoServer, readServerConfig } from './servir-core.mjs';

let config;
try {
  config = readServerConfig(process.env);
} catch (err) {
  if (!(err instanceof ServerConfigError)) throw err;
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

const log = (line) => console.log(`${new Date().toISOString()} ${line}`);
const server = createPhotoServer({ dir: config.dir, secret: config.secret, log });
// Un cliente lento no retiene una conexión para siempre; una foto de 10 MB cabe de sobra en 2 minutos.
server.headersTimeout = 10_000;
server.requestTimeout = 120_000;

server.on('error', (err) => {
  console.error(`Error: no se pudo escuchar en ${config.host}:${config.port}: ${err.message}`);
  process.exit(1);
});
server.listen(config.port, config.host, () => {
  log(`sirviendo ${config.dir} en http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('deteniendo');
    server.close(() => process.exit(0));
    server.closeAllConnections?.();
  });
}
