// Capturas del Estudio de diseño en escritorio, con el Supabase simulado de scripts/qa-movil/mock.js.
// No habla con ninguna base real: solo corre contra 127.0.0.1 / localhost.
//
// 1. Levanta la app apuntando a una dirección falsa:
//      VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=clave-falsa npx vite --host 127.0.0.1 --port 5173
// 2. Corre: node scripts/qa-estudio/capturas.mjs <modo> [ancho] [alto]
//
// Modos:
//   editar      abre el primer marco en el estudio (por defecto)
//   nuevo       «Nuevo marco»
//   lista       la pestaña Cámara sin abrir el editor
//   elementos   la pestaña Elementos de la biblioteca
//   interactuar selecciona la capa de texto con el ratón y la arrastra, guardando tres capturas
//
// Las capturas quedan en scripts/qa-estudio/salida/ (ignorada por git). Usa un alto de al menos ~1250 px en
// «interactuar»: el lienzo tiene que caber en la ventana para poder tocarlo.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.QA_BASE || 'http://127.0.0.1:5173';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(BASE)) {
  throw new Error(`QA_BASE debe ser local (127.0.0.1 o localhost); recibí ${BASE}. Esto crea datos de ejemplo y no debe tocar producción.`);
}

// playwright-core no es dependencia del proyecto: se busca igual que en scripts/qa-movil/audit.mjs.
function cargarPlaywright() {
  const candidatos = [process.env.PLAYWRIGHT_CORE, process.cwd()];
  try {
    const raiz = execSync('npm root -g', { encoding: 'utf8' }).trim();
    candidatos.push(path.join(raiz, '@playwright', 'cli'), path.join(raiz, 'playwright-core'), path.join(raiz, 'playwright'));
  } catch {
    // sin npm en el PATH: queda lo anterior
  }
  for (const base of candidatos.filter(Boolean)) {
    try {
      return createRequire(path.join(base, 'noop.js'))('playwright-core');
    } catch {
      // siguiente candidato
    }
  }
  throw new Error('No encuentro playwright-core. Instala playwright-cli (npm i -g @playwright/cli) o define PLAYWRIGHT_CORE.');
}

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

const [modo = 'editar', ancho = '1440', alto = '900'] = process.argv.slice(2);
const OUT = path.join(here, 'salida');
fs.mkdirSync(OUT, { recursive: true });

const pw = cargarPlaywright();
const installMock = (0, eval)(`(${fs.readFileSync(path.join(here, '..', 'qa-movil', 'mock.js'), 'utf8')})`);
const orgSession = JSON.stringify({
  access_token: 'x.y.z', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, refresh_token: 'r',
  user: { id: 'org1', aud: 'authenticated', role: 'authenticated', email: 'organizadora@ejemplo.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
});

const browser = await pw.chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(ancho), height: Number(alto) }, locale: 'es-CL' });
await context.addInitScript((s) => {
  try { localStorage.setItem('sb-127-auth-token', s); } catch { /* ignorar */ }
}, orgSession);
const page = await context.newPage();
await installMock(page);
const errores = [];
page.on('pageerror', (e) => errores.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 200)); });

await page.goto(`${BASE}/panel/e/${EVENT_ID}`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Cámara', exact: true }).click();
await page.waitForTimeout(600);

if (modo === 'nuevo') {
  await page.getByRole('button', { name: 'Nuevo marco' }).click();
} else if (modo !== 'lista') {
  await page.getByRole('button', { name: /^Editar / }).first().click();
}
await page.waitForTimeout(1500);

const lienzo = page.getByLabel('Lienzo del marco');

if (modo === 'elementos') {
  await page.getByRole('tab', { name: 'Elementos' }).click();
  await page.waitForTimeout(1200);
  await page.getByLabel('Biblioteca de diseño').screenshot({ path: path.join(OUT, 'elementos.png') });
} else if (modo === 'interactuar') {
  const caja = await lienzo.boundingBox();
  const foto = (n) => page.screenshot({ path: path.join(OUT, `interactuar-${n}.png`), clip: { x: caja.x - 40, y: caja.y - 40, width: caja.width + 80, height: caja.height + 80 } });
  // El marco de ejemplo trae un texto al pie (y = 0,92).
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height * 0.92;
  await page.mouse.click(x, y);
  await page.waitForTimeout(400);
  await foto('1-seleccion');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 3, y - 80, { steps: 8 });
  await page.mouse.move(x + 2, y - 160, { steps: 8 });
  await page.waitForTimeout(300);
  await foto('2-arrastrando');
  await page.mouse.up();
  await page.waitForTimeout(500);
  await foto('3-soltado');
} else {
  await page.screenshot({ path: path.join(OUT, `${modo}.png`), fullPage: true });
}

const medidas = await page.evaluate(() => {
  const caja = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  return {
    ventana: innerWidth,
    anchoPagina: document.documentElement.scrollWidth,
    estudio: caja('[aria-label="Estudio de diseño"]'),
    biblioteca: caja('[aria-label="Biblioteca de diseño"]'),
    lienzo: caja('[aria-label="Lienzo del marco"]'),
  };
});
console.log(JSON.stringify({ modo, ...medidas, errores }, null, 2));
await browser.close();
