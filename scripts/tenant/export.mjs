#!/usr/bin/env node

/**
 * CLI tool for exporting a single tenant's full data and storage assets.
 * Usage: node scripts/tenant/export.mjs <slug> [--out <dir>] [--brief-slug <slug>] [--sin-archivos]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { buildManifest, collectTenant } from './export-core.mjs';

const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;

function formatTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function parseCliArgs(args) {
  let slug = null;
  let outDir = null;
  let withoutFiles = false;
  let briefSlug = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--sin-archivos') {
      withoutFiles = true;
    } else if (arg === '--out') {
      if (i + 1 >= args.length) {
        console.error('Error: La opción --out requiere especificar una ruta de directorio.');
        process.exit(1);
      }
      outDir = args[++i];
    } else if (arg === '--brief-slug') {
      if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
        console.error('Error: La opción --brief-slug requiere especificar el slug del brief.');
        process.exit(1);
      }
      briefSlug = args[++i];
    } else if (arg.startsWith('--')) {
      console.error(`Error: Opción no reconocida "${arg}".`);
      console.error('Uso: node scripts/tenant/export.mjs <slug> [--out <dir>] [--brief-slug <slug>] [--sin-archivos]');
      process.exit(1);
    } else if (!slug) {
      slug = arg;
    } else {
      console.error(`Error: Argumento inesperado "${arg}".`);
      console.error('Uso: node scripts/tenant/export.mjs <slug> [--out <dir>] [--brief-slug <slug>] [--sin-archivos]');
      process.exit(1);
    }
  }

  if (!slug) {
    console.error('Error: Se debe especificar el slug del evento.');
    console.error('Uso: node scripts/tenant/export.mjs <slug> [--out <dir>] [--brief-slug <slug>] [--sin-archivos]');
    process.exit(1);
  }

  return { slug, outDir, withoutFiles, briefSlug };
}

async function main() {
  const { slug, outDir: customOutDir, withoutFiles, briefSlug } = parseCliArgs(process.argv.slice(2));

  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error('Error: Falta la variable de entorno DATABASE_URL.');
    process.exit(1);
  }

  if (!withoutFiles) {
    if (!process.env.SUPABASE_URL) {
      console.error('Error: Falta la variable de entorno SUPABASE_URL.');
      process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Error: Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY.');
      process.exit(1);
    }
  }

  // Determine output directory
  const defaultDirName = `${slug}-${formatTimestamp()}`;
  const resolvedOutDir = customOutDir
    ? path.resolve(process.cwd(), customOutDir)
    : path.resolve(process.cwd(), 'respaldos', defaultDirName);

  // Guard against non-empty output directories
  if (fs.existsSync(resolvedOutDir)) {
    const stat = fs.statSync(resolvedOutDir);
    if (!stat.isDirectory()) {
      console.error(`Error: La ruta "${resolvedOutDir}" existe y no es un directorio.`);
      process.exit(1);
    }
    const contents = fs.readdirSync(resolvedOutDir);
    if (contents.length > 0) {
      console.error(`Error: El directorio de destino "${resolvedOutDir}" ya existe y no está vacío.`);
      process.exit(1);
    }
  }

  // Connect to PostgreSQL database
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let data;
  try {
    await client.connect();
    data = await collectTenant((sql, params) => client.query(sql, params), slug, { briefSlug });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }

  // The backup holds guests' personal data: only the owner may read it.
  fs.mkdirSync(resolvedOutDir, { recursive: true, mode: PRIVATE_DIR });
  fs.chmodSync(resolvedOutDir, PRIVATE_DIR);

  // Download storage objects if requested
  const files = [];
  if (!withoutFiles && data.storageObjects && data.storageObjects.length > 0) {
    const supabaseUrl = process.env.SUPABASE_URL.replace(/\/+$/, '');
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const abortDownload = (message) => {
      console.error(message);
      console.error(`La carpeta "${resolvedOutDir}" quedó incompleta: bórrala antes de reintentar.`);
      process.exit(1);
    };

    for (const obj of data.storageObjects) {
      const bucket = obj.bucket_id;
      const name = obj.name;
      // The object name comes from the database: refuse anything that would land outside the event's folder.
      const eventRoot = path.join(resolvedOutDir, 'storage', bucket, String(data.event.id));
      const localFilePath = path.resolve(path.join(resolvedOutDir, 'storage', bucket), name);
      if (!localFilePath.startsWith(eventRoot + path.sep)) {
        abortDownload(`Error: El nombre del archivo "${bucket}/${name}" sale de la carpeta del evento; se aborta.`);
      }
      const encodedName = name.split('/').map(encodeURIComponent).join('/');
      const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedName}`;

      let res;
      try {
        res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
        });
      } catch (fetchErr) {
        abortDownload(`Error de red al descargar el archivo "${bucket}/${name}": ${fetchErr.message}`);
      }

      if (!res.ok) {
        abortDownload(`Error al descargar el archivo "${bucket}/${name}": HTTP ${res.status} ${res.statusText}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const sha256 = createHash('sha256').update(buffer).digest('hex');

      fs.mkdirSync(path.dirname(localFilePath), { recursive: true, mode: PRIVATE_DIR });
      fs.writeFileSync(localFilePath, buffer, { mode: PRIVATE_FILE });

      files.push({
        bucket,
        name,
        bytes: buffer.byteLength,
        sha256,
      });
    }
  }

  // Write data.json
  fs.writeFileSync(path.join(resolvedOutDir, 'data.json'), JSON.stringify(data, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: PRIVATE_FILE,
  });

  // Write manifest.json
  const manifest = buildManifest({
    slug,
    event: data.event,
    tables: data.tables,
    storageObjects: data.storageObjects,
    files,
    exportedAt: new Date().toISOString(),
  });
  fs.writeFileSync(path.join(resolvedOutDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: PRIVATE_FILE,
  });

  // Print summary in Spanish
  console.log(`\nRespaldo completado exitosamente en: ${resolvedOutDir}`);
  console.log(`Evento: ${data.event.name} (slug: ${data.event.slug}, id: ${data.event.id})`);
  console.log('\nResumen de elementos exportados:');
  for (const [table, count] of Object.entries(manifest.counts)) {
    console.log(`  - ${table}: ${count}`);
  }
}

main().catch((err) => {
  console.error(`Error inesperado: ${err.message}`);
  process.exit(1);
});
