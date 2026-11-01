#!/usr/bin/env node
/**
 * Uploads an event's ready frames to Supabase Storage.
 * Reads <dir-marcos>/marcos-listos.spec.json for the event slug and the file list,
 * looks up the event id in public.events and uploads each WebP from <dir-marcos>/listos/ to:
 *   event-assets/<event_id>/frames/<file>.webp
 *
 * Required environment variables (not needed with --dry-run):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Options:
 *   --dry-run: lists what would be uploaded, without any network request.
 *
 * Usage:
 *   node scripts/marcos/subir-marcos.mjs <dir-marcos> [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';

const USAGE = [
  'Uso: node scripts/marcos/subir-marcos.mjs <dir-marcos> [--dry-run]',
  '  <dir-marcos> es la carpeta del cliente con marcos-listos.spec.json y listos/*.webp.',
  '  Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, salvo con --dry-run.',
].join('\n');

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}
const isDryRun = args.includes('--dry-run');
const unknownFlags = args.filter((a) => a.startsWith('-') && a !== '--dry-run');
const positional = args.filter((a) => !a.startsWith('-'));

if (unknownFlags.length > 0 || positional.length !== 1) {
  if (unknownFlags.length > 0) console.error(`Error: Opción desconocida: ${unknownFlags.join(', ')}`);
  console.error(USAGE);
  process.exit(2);
}

const baseDir = path.resolve(positional[0]);
if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
  console.error(`Error: No existe la carpeta de marcos ${baseDir}`);
  process.exit(1);
}

// 1. Required env vars (never printed). A dry run makes no requests, so it does not need them.
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!isDryRun && (!supabaseUrl || !supabaseKey)) {
  console.error('Error: Faltan las variables de entorno requeridas SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Debes definir ambas variables de entorno antes de ejecutar este script.');
  process.exit(1);
}

// 2. Load the event spec
const specPath = path.join(baseDir, 'marcos-listos.spec.json');
if (!fs.existsSync(specPath)) {
  console.error(`Error: No se encontró el archivo spec en ${specPath}`);
  process.exit(1);
}

let spec;
try {
  spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
} catch (err) {
  console.error(`Error al parsear el archivo spec: ${err.message}`);
  process.exit(1);
}

const slug = spec.event_slug;
if (!slug) {
  console.error('Error: El spec no define "event_slug".');
  process.exit(1);
}

// 3. Unique WebP files required by the spec, in order of appearance
const listosDir = path.join(baseDir, 'listos');
const requiredFiles = [];
const seenFiles = new Set();

for (const frame of spec.frames || []) {
  for (const variant of Object.values(frame.variants || {})) {
    if (variant.image) {
      const fileName = `${variant.image}.webp`;
      if (!seenFiles.has(fileName)) {
        seenFiles.add(fileName);
        requiredFiles.push(fileName);
      }
    }
  }
}

// 4. Check every file exists before starting
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(listosDir, file)));
if (missing.length > 0) {
  console.error(`Error: Faltan ${missing.length} archivo(s) .webp requeridos en ${listosDir}:`);
  for (const m of missing) console.error(`  - ${m}`);
  console.error('Ejecuta primero scripts/marcos/preparar-marcos.py para generarlos.');
  process.exit(1);
}

// 5. --dry-run mode
if (isDryRun) {
  const eventId = '<event_id>';
  console.log('Modo --dry-run activo: no se realizará ninguna petición de red.\n');
  console.log(`Evento slug: «${slug}» (usando identificador simulado: ${eventId})`);
  console.log(`Archivos a subir (${requiredFiles.length}):`);
  for (const file of requiredFiles) {
    const sizeKb = (fs.statSync(path.join(listosDir, file)).size / 1024).toFixed(1);
    console.log(`  [DRY-RUN] ${file} (${sizeKb} KB) -> event-assets/${eventId}/frames/${file}`);
  }
  console.log(`\nSimulación completada con éxito: ${requiredFiles.length} archivos verificados.`);
  process.exit(0);
}

const authHeaders = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

// 6. Look up the event id through the Supabase REST API
console.log(`Consultando id del evento con slug «${slug}» en ${supabaseUrl}...`);
const eventUrl = `${supabaseUrl}/rest/v1/events?slug=eq.${encodeURIComponent(slug)}&select=id`;

let eventId;
try {
  const eventRes = await fetch(eventUrl, { method: 'GET', headers: authHeaders });
  if (!eventRes.ok) {
    const errText = await eventRes.text();
    console.error(`Error al consultar el evento en Supabase (HTTP ${eventRes.status}): ${errText}`);
    process.exit(1);
  }
  const events = await eventRes.json();
  if (!Array.isArray(events) || events.length === 0 || !events[0]?.id) {
    console.error(`Error: No se encontró ningún evento con slug «${slug}» en ${supabaseUrl}.`);
    process.exit(1);
  }
  eventId = events[0].id;
  console.log(`Evento encontrado: id = ${eventId}\n`);
} catch (err) {
  console.error(`Error de red al consultar el evento: ${err.message}`);
  process.exit(1);
}

// 7. Upload each file (upsert: re-running overwrites)
let successCount = 0;
let failCount = 0;

for (const file of requiredFiles) {
  const fileBuffer = fs.readFileSync(path.join(listosDir, file));
  const destPath = `event-assets/${eventId}/frames/${file}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${destPath}`;

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'image/webp',
        'x-upsert': 'true',
        'cache-control': '3600',
      },
      body: fileBuffer,
    });

    if (res.ok) {
      successCount++;
      console.log(`✓ ${file} (${(fileBuffer.length / 1024).toFixed(1)} KB) -> ${destPath}`);
    } else {
      failCount++;
      console.error(`✗ ${file} -> Error HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    failCount++;
    console.error(`✗ ${file} -> Fallo de conexión: ${err.message}`);
  }
}

console.log(`\nResumen: ${successCount} subidos correctamente, ${failCount} fallidos.`);
if (failCount > 0) process.exit(1);
