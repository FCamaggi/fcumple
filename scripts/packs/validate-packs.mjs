#!/usr/bin/env node
/**
 * Valida todos los paquetes de recursos en `public/packs/<pack-id>/pack.json`:
 * - Estructura del manifiesto y licencias obligatorias por pieza.
 * - Presupuesto de peso: SVG <= 60 KB, WebP/PNG <= 120 KB, paquete total <= 2 MB.
 * - Reglas de seguridad y renderizado en SVG: debe incluir `xmlns="http://www.w3.org/2000/svg"`
 *   y no contener `<script>`, `<foreignObject>` ni manejadores `on*=`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKS_ROOT = path.resolve(__dirname, '..', '..', 'public', 'packs');

const MAX_SVG_BYTES = 60 * 1024;
const MAX_RASTER_BYTES = 120 * 1024;
const MAX_PACK_BYTES = 2 * 1024 * 1024;

let hasError = false;
function fail(msg) {
  console.error(`ERROR [packs]: ${msg}`);
  hasError = true;
}

if (!fs.existsSync(PACKS_ROOT)) {
  console.log('Sin carpeta public/packs/ todavía.');
  process.exit(0);
}

const dirs = fs
  .readdirSync(PACKS_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const dir of dirs) {
  const packDir = path.join(PACKS_ROOT, dir);
  const manifestPath = path.join(packDir, 'pack.json');
  if (!fs.existsSync(manifestPath)) {
    fail(`${dir}: falta pack.json`);
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    fail(`${dir}/pack.json: JSON inválido (${err.message})`);
    continue;
  }

  if (manifest.id !== dir) {
    fail(`${dir}/pack.json: id "${manifest.id}" no coincide con el nombre de la carpeta "${dir}"`);
  }

  let totalBytes = fs.statSync(manifestPath).size;
  for (const asset of manifest.assets ?? []) {
    const filePath = path.join(packDir, asset.file);
    if (!fs.existsSync(filePath)) {
      fail(`${dir}: no existe el archivo ${asset.file} declarado en ${asset.id}`);
      continue;
    }
    const size = fs.statSync(filePath).size;
    totalBytes += size;

    if (asset.format === 'svg') {
      if (size > MAX_SVG_BYTES) {
        fail(`${dir}/${asset.file}: pesa ${size} B (máximo SVG: ${MAX_SVG_BYTES} B)`);
      }
      const text = fs.readFileSync(filePath, 'utf8');
      if (!text.includes('xmlns="http://www.w3.org/2000/svg"')) {
        fail(`${dir}/${asset.file}: falta xmlns="http://www.w3.org/2000/svg"`);
      }
      if (/<script\b|<foreignObject\b|\bon[a-z]+\s*=/i.test(text)) {
        fail(`${dir}/${asset.file}: contiene etiquetas o atributos prohibidos`);
      }
    } else if (size > MAX_RASTER_BYTES) {
      fail(`${dir}/${asset.file}: pesa ${size} B (máximo raster: ${MAX_RASTER_BYTES} B)`);
    }

    if (!asset.license?.source || !asset.license?.spdx || !asset.license?.date) {
      fail(`${dir}/${asset.id}: falta licencia completa (source, spdx, date)`);
    }
  }

  if (totalBytes > MAX_PACK_BYTES) {
    fail(`${dir}: el paquete pesa ${totalBytes} B (máximo: ${MAX_PACK_BYTES} B)`);
  } else {
    console.log(
      `OK pack "${manifest.id}" (${manifest.visibility}): ${manifest.assets?.length ?? 0} recursos, ${totalBytes} B`,
    );
  }
}

if (hasError) process.exit(1);
